import { type Highlight, HighlightManager } from "@gloss/anchoring";
import {
	hideCommentIndicator,
	showCommentIndicator,
	updateCommentIndicatorState,
} from "../content-ui/comment-indicator";
import {
	hideCommentPanel,
	showCommentPanel,
} from "../content-ui/comment-panel";
import {
	hideHoverPill,
	hideMarginAnnotations,
	showHoverPill,
	showMarginAnnotations,
} from "../content-ui/margin-annotations";
import { generateId } from "../content-ui/popover";
import {
	hideSelectionPopover,
	showSelectionPopover,
} from "../content-ui/selection-popover";
import { OWN_HIGHLIGHT_COLOR, userHighlightColor } from "../utils/colors";
import {
	isErrorResponse,
	type PageCommentSummary,
	type ServerComment,
	type ServerHighlight,
	sendMessage,
	type UserSettings,
} from "../utils/messages";

// Auth state cached for the session
let isAuthenticated = false;
let currentUserId: string | null = null;

// User settings
let userSettings: UserSettings | null = null;

// Margin annotations state
let annotationsVisible = false;
let currentCommentSummary: PageCommentSummary | null = null;
let _currentManager: HighlightManager | null = null;

// Map of highlight ID to comment count (for hover pill)
const highlightCommentCounts = new Map<string, number>();

// Storage key for user toggle state (persists manual toggle across pages)
const ANNOTATIONS_TOGGLED_KEY = "glossAnnotationsToggled";

/**
 * Load user's manual toggle state for annotations.
 * Returns null if user hasn't manually toggled yet (use setting default).
 */
async function loadAnnotationToggleState(): Promise<boolean | null> {
	try {
		const result = await browser.storage.sync.get(ANNOTATIONS_TOGGLED_KEY);
		const value = result[ANNOTATIONS_TOGGLED_KEY];
		// If undefined, user hasn't toggled yet
		return value === undefined ? null : value === true;
	} catch (error) {
		console.error("[Gloss] Failed to load annotation toggle state:", error);
		return null;
	}
}

/**
 * Save user's manual toggle state for annotations.
 */
async function saveAnnotationToggleState(visible: boolean): Promise<void> {
	try {
		await browser.storage.sync.set({ [ANNOTATIONS_TOGGLED_KEY]: visible });
	} catch (error) {
		console.error("[Gloss] Failed to save annotation toggle state:", error);
	}
}

/**
 * Load user settings from background script.
 */
async function loadUserSettings(): Promise<void> {
	try {
		const response = await sendMessage({ type: "GET_USER_SETTINGS" });
		if (!isErrorResponse(response)) {
			userSettings = response.settings;
			console.log("[Gloss] User settings loaded:", userSettings);
		}
	} catch (error) {
		console.error("[Gloss] Failed to load user settings:", error);
	}
}

export default defineContentScript({
	matches: ["<all_urls>"],
	runAt: "document_idle",
	async main(ctx) {
		console.log("[Gloss] Content script initialized", {
			url: location.href,
		});

		// Listen for messages from background script (e.g., metadata requests)
		browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
			if (message.type === "GET_PAGE_METADATA") {
				import("../utils/metadata").then(({ extractPageMetadata }) => {
					const metadata = extractPageMetadata();
					sendResponse({ metadata });
				});
				return true; // Keep channel open for async response
			}
		});

		// Fetch initial auth state and user settings
		await refreshAuthState();
		if (isAuthenticated) {
			await loadUserSettings();
		}

		// Create highlight manager with event handling
		const manager = new HighlightManager({
			onEvent: (event) => {
				switch (event.type) {
					case "click": {
						const element = event.event.target as HTMLElement;
						handleHighlightClick(manager, event.highlightId, element);
						break;
					}
					case "anchored": {
						console.log(
							`[Gloss] Highlight anchored via ${event.method}:`,
							event.highlightId
						);
						// Add hover listeners for comment pill
						const active = manager.get(event.highlightId);
						if (active) {
							setupHighlightHoverListeners(
								manager,
								event.highlightId,
								active.elements
							);
						}
						break;
					}
					case "orphaned":
						console.log("[Gloss] Highlight orphaned:", event.highlightId);
						break;
					default:
						break;
				}
			},
		});

		// Store manager reference for margin annotations
		_currentManager = manager;

		// Start observing for navigation and DOM mutations
		manager.observe();

		// Load highlights for current page (don't block on this)
		loadHighlights(manager).then(async (highlightIds) => {
			console.log("[Gloss] Highlights loaded");
			// Load comment summary after highlights are loaded
			if (highlightIds.length > 0) {
				await loadCommentSummary(manager, highlightIds);
			}
		});

		// Set up selection detection
		const handleMouseUp = (e: MouseEvent) => {
			// Small delay to ensure selection is finalized
			setTimeout(() => {
				handleSelection(e, manager);
			}, 10);
		};

		document.addEventListener("mouseup", handleMouseUp);

		// Handle navigation events (re-load highlights for new URL)
		let lastUrl = location.href;
		const navigationCheck = setInterval(() => {
			if (location.href !== lastUrl) {
				lastUrl = location.href;
				console.log("[Gloss] URL changed, reloading highlights");
				manager.clear();
				hideSelectionPopover();
				hideCommentPanel();
				hideCommentIndicator();
				hideMarginAnnotations();
				hideHoverPill();
				annotationsVisible = false;
				currentCommentSummary = null;
				highlightCommentCounts.clear();
				loadHighlights(manager).then(async (highlightIds) => {
					if (highlightIds.length > 0) {
						await loadCommentSummary(manager, highlightIds);
					}
				});
			}
		}, 500);

		// Clean up on script invalidation (extension reload, navigation, etc.)
		ctx.onInvalidated(() => {
			console.log("[Gloss] Content script invalidated, cleaning up");
			clearInterval(navigationCheck);
			document.removeEventListener("mouseup", handleMouseUp);
			hideSelectionPopover();
			hideCommentPanel();
			hideCommentIndicator();
			hideMarginAnnotations();
			hideHoverPill();
			highlightCommentCounts.clear();
			manager.destroy();
			_currentManager = null;
		});
	},
});

/**
 * Refresh auth state from background script.
 */
async function refreshAuthState(): Promise<void> {
	try {
		const response = await sendMessage({ type: "GET_AUTH_STATUS" });
		isAuthenticated = response.authenticated;
		currentUserId = response.user?.id ?? null;
		console.log("[Gloss] Auth state:", { isAuthenticated, currentUserId });
	} catch (error) {
		console.error("[Gloss] Failed to get auth status:", error);
		isAuthenticated = false;
		currentUserId = null;
	}
}

/**
 * Load comment summary for all highlights on the page.
 */
async function loadCommentSummary(
	manager: HighlightManager,
	highlightIds: string[]
): Promise<void> {
	try {
		const response = await sendMessage({
			type: "LOAD_PAGE_COMMENT_SUMMARY",
			highlightIds,
		});

		if (isErrorResponse(response)) {
			console.error("[Gloss] Failed to load comment summary:", response.error);
			return;
		}

		currentCommentSummary = response;

		// Populate comment counts map for hover pills
		highlightCommentCounts.clear();
		for (const hc of response.highlightComments) {
			highlightCommentCounts.set(hc.highlightId, hc.comments.length);
		}

		console.log(
			`[Gloss] Comment summary loaded: ${response.totalComments} comments from ${response.commenters.length} people`
		);

		// Show indicator and annotations if there are comments
		if (response.totalComments > 0) {
			// Determine default visibility based on user settings
			// "expanded" = show annotations by default, "collapsed" = hide by default
			const settingDefault = userSettings?.commentDisplayMode === "expanded";

			// Check if user has manually toggled annotations (overrides setting)
			const manualToggle = await loadAnnotationToggleState();
			annotationsVisible =
				manualToggle !== null ? manualToggle : settingDefault;

			showCommentIndicator({
				summary: response,
				annotationsVisible,
				onToggleAnnotations: () => toggleAnnotations(manager),
			});

			// Show annotations if visible
			if (annotationsVisible) {
				showMarginAnnotations({
					manager,
					summary: response,
					currentUserId: currentUserId ?? undefined,
					onAnnotationClick: (highlightId, element) => {
						handleHighlightClick(manager, highlightId, element);
					},
					onCreateComment: async (highlightId, content, mentions, parentId) => {
						const response = await sendMessage({
							type: "CREATE_COMMENT",
							highlightId,
							content,
							mentions,
							parentId,
						});
						if (!isErrorResponse(response)) {
							// Update local comment summary
							await loadCommentSummary(manager, [highlightId]);
							return response.comment;
						}
						return null;
					},
					onDeleteComment: async (commentId) => {
						const response = await sendMessage({
							type: "DELETE_COMMENT",
							id: commentId,
						});
						return !isErrorResponse(response);
					},
					onSearchFriends: async (query) => {
						const response = await sendMessage({
							type: "SEARCH_FRIENDS",
							query,
						});
						if (!isErrorResponse(response)) {
							return response.friends;
						}
						return [];
					},
				});
			}
		}
	} catch (error) {
		console.error("[Gloss] Error loading comment summary:", error);
	}
}

/**
 * Toggle margin annotations visibility.
 */
async function toggleAnnotations(manager: HighlightManager): Promise<void> {
	annotationsVisible = !annotationsVisible;

	// Persist user's manual toggle state
	await saveAnnotationToggleState(annotationsVisible);

	// Update indicator state
	updateCommentIndicatorState(annotationsVisible);

	if (annotationsVisible && currentCommentSummary) {
		showMarginAnnotations({
			manager,
			summary: currentCommentSummary,
			currentUserId: currentUserId ?? undefined,
			onAnnotationClick: (highlightId, element) => {
				handleHighlightClick(manager, highlightId, element);
			},
			onCreateComment: async (highlightId, content, mentions, parentId) => {
				const response = await sendMessage({
					type: "CREATE_COMMENT",
					highlightId,
					content,
					mentions,
					parentId,
				});
				if (!isErrorResponse(response)) {
					// Reload full page summary to get updated counts
					const highlightIds = Array.from(highlightCommentCounts.keys());
					if (highlightIds.length > 0) {
						await loadCommentSummary(manager, highlightIds);
					}
					return response.comment;
				}
				return null;
			},
			onDeleteComment: async (commentId) => {
				const response = await sendMessage({
					type: "DELETE_COMMENT",
					id: commentId,
				});
				return !isErrorResponse(response);
			},
			onSearchFriends: async (query) => {
				const response = await sendMessage({
					type: "SEARCH_FRIENDS",
					query,
				});
				if (!isErrorResponse(response)) {
					return response.friends;
				}
				return [];
			},
		});
	} else {
		hideMarginAnnotations();
	}
}

/**
 * Set up hover listeners on highlight elements to show comment pill.
 */
function setupHighlightHoverListeners(
	manager: HighlightManager,
	highlightId: string,
	elements: HTMLElement[]
): void {
	for (const element of elements) {
		element.addEventListener("mouseenter", () => {
			const commentCount = highlightCommentCounts.get(highlightId);
			if (commentCount && commentCount > 0) {
				showHoverPill({
					highlightElement: element,
					highlightId,
					commentCount,
					onClick: () => {
						handleHighlightClick(manager, highlightId, element);
					},
				});
			}
		});

		// Don't hide on mouseleave - let the pill stay visible while scrolling
		// It will be hidden when: hovering another highlight, clicking pill, or scrolling out of view
	}
}

/**
 * Handle text selection and show popover if valid.
 */
function handleSelection(e: MouseEvent, manager: HighlightManager): void {
	const selection = window.getSelection();

	// No selection or collapsed selection
	if (!selection || selection.isCollapsed || !selection.toString().trim()) {
		hideSelectionPopover();
		return;
	}

	// Ignore if click was inside an input, textarea, or editable element
	const target = e.target as Element;
	if (
		target.closest(
			'input, textarea, [contenteditable="true"], .gloss-highlight'
		)
	) {
		hideSelectionPopover();
		return;
	}

	// Ignore if selection is inside our popover
	if (target.closest("#gloss-selection-popover, #gloss-highlight-popover")) {
		return;
	}

	// Get the bounding rect of the selection
	const range = selection.getRangeAt(0);
	const rect = range.getBoundingClientRect();

	// Show the popover
	showSelectionPopover({
		rect,
		isAuthenticated,
		onHighlight: async () => {
			await createHighlight(manager);
		},
		onSignIn: () => {
			// Open the web app login page
			browser.runtime.sendMessage({
				type: "OPEN_TAB",
				url: `${import.meta.env.VITE_WEB_URL || "http://localhost:3001"}/login`,
			});
		},
	});
}

/**
 * Create a highlight from the saved selector (pre-computed when popover was shown).
 */
async function createHighlight(manager: HighlightManager): Promise<void> {
	// Use the pre-computed selector from when the popover was shown
	const { getSavedSelector, getSavedText, clearSavedSelection } = await import(
		"../content-ui/selection-popover"
	);

	const selector = getSavedSelector();
	const text = getSavedText();

	if (!(selector && text)) {
		console.error("[Gloss] No saved selection to highlight");
		return;
	}

	if (!text.trim()) {
		console.error("[Gloss] Saved selection text is empty");
		clearSavedSelection();
		return;
	}

	const id = generateId();

	try {
		// Add highlight with userId in metadata so we know we own it
		const highlight: Highlight = {
			id,
			selector,
			color: OWN_HIGHLIGHT_COLOR,
			metadata: { userId: currentUserId },
		};
		manager.add(highlight);

		// Clear the saved selection data
		clearSavedSelection();

		console.log("[Gloss] Created highlight:", { id, text: text.slice(0, 50) });

		// Clear the browser selection
		const selection = window.getSelection();
		if (selection) {
			selection.removeAllRanges();
		}

		// Save to server via background script
		const response = await sendMessage({
			type: "CREATE_HIGHLIGHT",
			url: location.href,
			selector,
			text,
		});

		if (isErrorResponse(response)) {
			console.error(
				"[Gloss] Failed to save highlight:",
				JSON.stringify(response)
			);
			// Remove the DOM highlight if save failed
			manager.remove(id);
			return;
		}

		console.log("[Gloss] Highlight saved:", response.highlight.id);

		// Store the server ID in the highlight metadata for later use
		const active = manager.get(id);
		if (active) {
			active.highlight.metadata = {
				...active.highlight.metadata,
				serverId: response.highlight.id,
			};
		}
	} catch (error) {
		console.error("[Gloss] Error creating highlight:", error);
		// Try to clean up the DOM highlight
		manager.remove(id);
	}
}

/**
 * Handle click on an existing highlight.
 */
async function handleHighlightClick(
	manager: HighlightManager,
	highlightId: string,
	element: HTMLElement
): Promise<void> {
	// Hide selection popover if open
	hideSelectionPopover();

	// Get the highlight data
	const active = manager.get(highlightId);
	if (!active) {
		console.error("[Gloss] Highlight not found:", highlightId);
		return;
	}

	// Get the highlight definition
	const highlightData = active.highlight;

	// Determine if current user owns this highlight
	const isOwner =
		(highlightData.metadata?.userId as string | undefined) === currentUserId;

	// Get the server ID (stored in metadata for locally created highlights,
	// or the highlight ID itself for server-loaded highlights)
	const serverId =
		(highlightData.metadata?.serverId as string | undefined) ?? highlightId;

	// Load comments for this highlight
	let comments: ServerComment[] = [];
	try {
		const response = await Promise.race([
			sendMessage({
				type: "LOAD_COMMENTS",
				highlightId: serverId,
			}),
			new Promise<{ error: string }>((_, reject) =>
				setTimeout(() => reject(new Error("Timeout loading comments")), 5000)
			),
		]);
		if (!isErrorResponse(response)) {
			comments = response.comments;
		}
	} catch (error) {
		console.error("[Gloss] Error loading comments:", error);
	}
	// Show the comment panel
	showCommentPanel({
		element,
		highlight: active,
		isOwner,
		currentUserId: currentUserId ?? undefined,
		comments,
		onLoadComments: async () => {
			try {
				const response = await sendMessage({
					type: "LOAD_COMMENTS",
					highlightId: serverId,
				});
				if (!isErrorResponse(response)) {
					return response.comments;
				}
			} catch (error) {
				console.error("[Gloss] Error loading comments:", error);
			}
			return [];
		},
		onCreateComment: async (content, mentions) => {
			try {
				const response = await sendMessage({
					type: "CREATE_COMMENT",
					highlightId: serverId,
					content,
					mentions,
				});
				if (!isErrorResponse(response)) {
					console.log("[Gloss] Comment created:", response.comment.id);
					return response.comment;
				}
				console.error("[Gloss] Failed to create comment:", response.error);
			} catch (error) {
				console.error("[Gloss] Error creating comment:", error);
			}
			return null;
		},
		onDeleteComment: async (commentId) => {
			try {
				const response = await sendMessage({
					type: "DELETE_COMMENT",
					id: commentId,
				});
				if (!isErrorResponse(response)) {
					console.log("[Gloss] Comment deleted:", commentId);
					return true;
				}
				console.error("[Gloss] Failed to delete comment:", response.error);
			} catch (error) {
				console.error("[Gloss] Error deleting comment:", error);
			}
			return false;
		},
		onDeleteHighlight: isOwner
			? async () => {
					try {
						// Remove from DOM first (use local ID)
						manager.remove(highlightId);

						// Then delete on server (use server ID)
						const response = await sendMessage({
							type: "DELETE_HIGHLIGHT",
							id: serverId,
						});

						if (isErrorResponse(response)) {
							console.error(
								"[Gloss] Failed to delete highlight:",
								response.error
							);
						} else {
							console.log("[Gloss] Highlight deleted");
						}
					} catch (error) {
						console.error("[Gloss] Error deleting highlight:", error);
					}
				}
			: undefined,
		onSearchFriends: async (query) => {
			try {
				const response = await sendMessage({
					type: "SEARCH_FRIENDS",
					query,
				});
				if (!isErrorResponse(response)) {
					return response.friends;
				}
			} catch (error) {
				console.error("[Gloss] Error searching friends:", error);
			}
			return [];
		},
	});
}

/**
 * Convert server highlight to anchoring library format.
 * Uses OWN_HIGHLIGHT_COLOR for own highlights, or generates a color
 * from the user's name for friend highlights.
 */
function toHighlight(serverHighlight: ServerHighlight): Highlight {
	// Determine color based on whether this is own highlight or friend's
	const isOwnHighlight = serverHighlight.userId === currentUserId;
	const color = isOwnHighlight
		? OWN_HIGHLIGHT_COLOR
		: userHighlightColor(serverHighlight.user?.name ?? "Friend");

	return {
		id: serverHighlight.id,
		selector: serverHighlight.selector,
		color,
		metadata: {
			userId: serverHighlight.userId,
			userName: serverHighlight.user?.name,
			userImage: serverHighlight.user?.image,
			text: serverHighlight.text,
			visibility: serverHighlight.visibility,
			createdAt: serverHighlight.createdAt,
		},
	};
}

/**
 * Load and apply highlights for the current page.
 * Returns the list of highlight IDs that were loaded.
 */
async function loadHighlights(manager: HighlightManager): Promise<string[]> {
	const url = location.href;

	try {
		const response = await sendMessage({ type: "LOAD_HIGHLIGHTS", url });

		if (isErrorResponse(response)) {
			console.error("[Gloss] Failed to load highlights:", response.error);
			return [];
		}

		const { highlights } = response;
		console.log(`[Gloss] Loading ${highlights.length} highlights for ${url}`);

		// Convert to anchoring library format and load
		const converted = highlights.map(toHighlight);
		const results = manager.load(converted);

		// Log results
		let anchored = 0;
		let orphaned = 0;
		const loadedIds: string[] = [];
		for (const [id, success] of results.entries()) {
			if (success) {
				anchored++;
				loadedIds.push(id);
			} else {
				orphaned++;
			}
		}

		console.log(
			`[Gloss] Highlights loaded: ${anchored} anchored, ${orphaned} orphaned`
		);

		return loadedIds;
	} catch (error) {
		console.error("[Gloss] Error loading highlights:", error);
		return [];
	}
}
