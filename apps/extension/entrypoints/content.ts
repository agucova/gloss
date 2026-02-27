import { type Highlight, HighlightManager } from "@gloss/anchoring";
import { render } from "solid-js/web";

// Import content CSS as inline string for shadow DOM injection
import contentCss from "../content-ui/content.css?inline";
import {
	isDomainDisabled,
	loadIndicatorCorner,
	saveIndicatorCorner,
} from "../content-ui/domain-settings";
import { ensureFontLoaded } from "../content-ui/font";
import {
	type GlossAppApi,
	type GlossAppCallbacks,
	GlossApp,
} from "../content-ui/gloss-app";
import {
	captureSelection,
	clearSavedSelection,
	getSavedSelector,
	getSavedText,
} from "../content-ui/selection-popover";
import {
	annotationsVisible,
	commentSummary,
	currentUserId,
	isAuthenticated,
	setAnnotationsVisible,
	setCommentSummary,
	setCurrentUserId,
	setHighlightCommentCounts,
	setIsAuthenticated,
	setManager,
	setUserSettings,
	userSettings,
} from "../content-ui/store";
import { generateId } from "../content-ui/utils";
import { OWN_HIGHLIGHT_COLOR, userHighlightColor } from "../utils/colors";
import {
	type ServerComment,
	type ServerHighlight,
	isErrorResponse,
	sendMessage,
} from "../utils/messages";

// Storage key for user toggle state (persists manual toggle across pages)
const ANNOTATIONS_TOGGLED_KEY = "glossAnnotationsToggled";

async function loadAnnotationToggleState(): Promise<boolean | null> {
	try {
		const result = await browser.storage.sync.get(ANNOTATIONS_TOGGLED_KEY);
		const value = result[ANNOTATIONS_TOGGLED_KEY];
		return value === undefined ? null : value === true;
	} catch (error) {
		console.error("[Gloss] Failed to load annotation toggle state:", error);
		return null;
	}
}

async function saveAnnotationToggleState(visible: boolean): Promise<void> {
	try {
		await browser.storage.sync.set({ [ANNOTATIONS_TOGGLED_KEY]: visible });
	} catch (error) {
		console.error("[Gloss] Failed to save annotation toggle state:", error);
	}
}

async function loadUserSettingsFromServer(): Promise<void> {
	try {
		const response = await sendMessage({ type: "GET_USER_SETTINGS" });
		if (!isErrorResponse(response)) {
			setUserSettings(response.settings);
			console.log("[Gloss] User settings loaded:", response.settings);
		}
	} catch (error) {
		console.error("[Gloss] Failed to load user settings:", error);
	}
}

async function refreshAuthState(): Promise<void> {
	try {
		const response = await sendMessage({ type: "GET_AUTH_STATUS" });
		setIsAuthenticated(response.authenticated);
		setCurrentUserId(response.user?.id ?? null);
		console.log("[Gloss] Auth state:", {
			isAuthenticated: isAuthenticated(),
			currentUserId: currentUserId(),
		});
	} catch (error) {
		console.error("[Gloss] Failed to get auth status:", error);
		setIsAuthenticated(false);
		setCurrentUserId(null);
	}
}

export default defineContentScript({
	matches: ["<all_urls>"],
	runAt: "document_idle",
	async main(ctx) {
		if (await isDomainDisabled()) {
			console.log("[Gloss] Disabled for this domain, skipping initialization");
			return;
		}

		console.log("[Gloss] Content script initialized", {
			url: location.href,
		});

		// Load the Satoshi font
		ensureFontLoaded();

		// Listen for messages from background script
		browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
			if (message.type === "GET_PAGE_METADATA") {
				import("../utils/metadata").then(({ extractPageMetadata }) => {
					const metadata = extractPageMetadata();
					sendResponse({ metadata });
					return undefined;
				});
				return true;
			}
		});

		// Fetch initial auth state and user settings
		await refreshAuthState();
		if (isAuthenticated()) {
			await loadUserSettingsFromServer();
		}

		// =====================================================================
		// Create highlight manager
		// =====================================================================

		// We need a reference to the app API, which is set after render
		let appApi: GlossAppApi | null = null;

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

		setManager(manager);
		manager.observe();

		// =====================================================================
		// Create shadow DOM host and render Solid app
		// =====================================================================

		const host = document.createElement("div");
		host.id = "gloss-root";
		host.style.cssText =
			"all: initial; position: fixed; top: 0; left: 0; z-index: 2147483645; pointer-events: none;";
		const shadow = host.attachShadow({ mode: "open" });

		// Inject styles
		const style = document.createElement("style");
		style.textContent = contentCss;
		shadow.appendChild(style);

		// Container for Solid to render into
		const container = document.createElement("div");
		container.id = "gloss-container";
		shadow.appendChild(container);

		document.body.appendChild(host);

		// Define callbacks
		const callbacks: GlossAppCallbacks = {
			onHighlight: async () => {
				await createHighlight(manager);
			},
			onSignIn: () => {
				browser.runtime.sendMessage({
					type: "OPEN_TAB",
					url: `${import.meta.env.VITE_WEB_URL || "http://localhost:3001"}/login`,
				});
			},
			onToggleAnnotations: async () => {
				setAnnotationsVisible(!annotationsVisible());
				await saveAnnotationToggleState(annotationsVisible());
			},
			onCornerChange: (corner) => {
				saveIndicatorCorner(corner);
			},
			onDisableDomain: () => {
				appApi?.hidePanel();
				setCommentSummary(null);
				setAnnotationsVisible(false);
				setHighlightCommentCounts(new Map());
				manager.clear();
			},
			onAnnotationClick: (highlightId, element) => {
				if (element) {
					handleHighlightClick(manager, highlightId, element);
				}
			},
			onCreateComment: async (content, mentions, parentId) => {
				const serverId = appApi?.panelServerId;
				if (!serverId) return;

				try {
					const response = await sendMessage({
						type: "CREATE_COMMENT",
						highlightId: serverId,
						content,
						mentions,
						parentId,
					});
					if (!isErrorResponse(response)) {
						console.log("[Gloss] Comment created:", response.comment.id);
						const commentsResp = await sendMessage({
							type: "LOAD_COMMENTS",
							highlightId: serverId,
						});
						if (!isErrorResponse(commentsResp)) {
							appApi?.setPanelComments(commentsResp.comments);
						}
					}
				} catch (error) {
					console.error("[Gloss] Error creating comment:", error);
				}
			},
			onDeleteComment: async (commentId) => {
				try {
					const response = await sendMessage({
						type: "DELETE_COMMENT",
						id: commentId,
					});
					if (!isErrorResponse(response)) {
						console.log("[Gloss] Comment deleted:", commentId);
						const highlightIds =
							commentSummary()?.highlightComments.map((hc) => hc.highlightId) ??
							[];
						if (highlightIds.length > 0) {
							await refreshCommentSummary(highlightIds);
						}
						const serverId = appApi?.panelServerId;
						if (serverId) {
							const commentsResp = await sendMessage({
								type: "LOAD_COMMENTS",
								highlightId: serverId,
							});
							if (!isErrorResponse(commentsResp)) {
								appApi?.setPanelComments(commentsResp.comments);
							}
						}
					}
				} catch (error) {
					console.error("[Gloss] Error deleting comment:", error);
				}
			},
			onDeleteHighlight: async () => {
				const highlightId = appApi?.panelHighlightId;
				const serverId = appApi?.panelServerId;
				if (!(highlightId && serverId)) return;

				try {
					manager.remove(highlightId);
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
						const highlightIds =
							commentSummary()
								?.highlightComments.map((hc) => hc.highlightId)
								.filter((id) => id !== serverId) ?? [];
						if (highlightIds.length > 0) {
							await refreshCommentSummary(highlightIds);
						} else {
							setCommentSummary(null);
						}
					}
				} catch (error) {
					console.error("[Gloss] Error deleting highlight:", error);
				}
			},
			onSearchFriends: async (query) => {
				try {
					const response = await sendMessage({
						type: "SEARCH_FRIENDS",
						query,
					});
					if (!isErrorResponse(response)) {
						appApi?.setMentionResults(response.friends);
					}
				} catch (error) {
					console.error("[Gloss] Error searching friends:", error);
				}
			},
			onPanelClosed: async () => {
				const highlightIds =
					commentSummary()?.highlightComments.map((hc) => hc.highlightId) ?? [];
				if (highlightIds.length > 0) {
					await refreshCommentSummary(highlightIds);
				}
			},
		};

		// Render the Solid app
		const dispose = render(
			() =>
				GlossApp({
					callbacks,
					apiRef: (api) => {
						appApi = api;
					},
				}),
			container
		);

		// =====================================================================
		// Selection handling
		// =====================================================================

		const handleMouseUp = (e: MouseEvent) => {
			setTimeout(() => {
				handleSelection(e);
			}, 10);
		};
		document.addEventListener("mouseup", handleMouseUp);

		// =====================================================================
		// Load initial data
		// =====================================================================

		void loadHighlights(manager).then(async (highlightIds) => {
			console.log("[Gloss] Highlights loaded");
			if (highlightIds.length > 0) {
				await loadCommentSummary(manager, highlightIds, appApi);
			}
			return undefined;
		});

		// =====================================================================
		// Navigation detection
		// =====================================================================

		let lastUrl = location.href;
		const navigationCheck = setInterval(() => {
			if (location.href !== lastUrl) {
				lastUrl = location.href;
				console.log("[Gloss] URL changed, reloading highlights");
				manager.clear();
				appApi?.hidePopover();
				appApi?.hidePanel();
				setCommentSummary(null);
				setAnnotationsVisible(false);
				setHighlightCommentCounts(new Map());

				void loadHighlights(manager).then(async (highlightIds) => {
					if (highlightIds.length > 0) {
						await loadCommentSummary(manager, highlightIds, appApi);
					}
					return undefined;
				});
			}
		}, 500);

		// =====================================================================
		// Cleanup
		// =====================================================================

		ctx.onInvalidated(() => {
			console.log("[Gloss] Content script invalidated, cleaning up");
			clearInterval(navigationCheck);
			document.removeEventListener("mouseup", handleMouseUp);
			dispose();
			host.remove();
			setManager(null);
			setCommentSummary(null);
			setHighlightCommentCounts(new Map());
			manager.destroy();
		});

		// =====================================================================
		// Helper functions (scoped to have access to appApi)
		// =====================================================================

		function handleSelection(e: MouseEvent): void {
			const selection = window.getSelection();

			if (!selection || selection.isCollapsed || !selection.toString().trim()) {
				appApi?.hidePopover();
				return;
			}

			const target = e.target as Element;
			if (
				target.closest(
					'input, textarea, [contenteditable="true"], .gloss-highlight'
				)
			) {
				appApi?.hidePopover();
				return;
			}

			// Ignore if inside our shadow DOM host
			if (target.closest("#gloss-root")) {
				return;
			}

			if (!captureSelection()) return;

			const range = selection.getRangeAt(0);
			const rect = range.getBoundingClientRect();

			appApi?.showPopover(rect);
		}

		async function handleHighlightClick(
			mgr: HighlightManager,
			highlightId: string,
			element: HTMLElement
		): Promise<void> {
			const active = mgr.get(highlightId);
			if (!active) {
				console.error("[Gloss] Highlight not found:", highlightId);
				return;
			}

			const highlightData = active.highlight;
			const userId = currentUserId();
			const isOwner =
				(highlightData.metadata?.userId as string | undefined) === userId;
			const serverId =
				(highlightData.metadata?.serverId as string | undefined) ?? highlightId;

			let comments: ServerComment[] = [];
			try {
				const response = await Promise.race([
					sendMessage({ type: "LOAD_COMMENTS", highlightId: serverId }),
					new Promise<{ error: string }>((_, reject) =>
						setTimeout(
							() => reject(new Error("Timeout loading comments")),
							5000
						)
					),
				]);
				if (!isErrorResponse(response)) {
					comments = response.comments;
				}
			} catch (error) {
				console.error("[Gloss] Error loading comments:", error);
			}

			appApi?.showPanel({
				highlight: active,
				element,
				isOwner,
				currentUserId: userId ?? "",
				comments,
				serverId,
				highlightId,
			});
		}
	},
});

// =============================================================================
// Standalone helper functions
// =============================================================================

async function refreshCommentSummary(highlightIds: string[]): Promise<void> {
	try {
		const response = await sendMessage({
			type: "LOAD_PAGE_COMMENT_SUMMARY",
			highlightIds,
		});
		if (!isErrorResponse(response)) {
			setCommentSummary(response);
			const counts = new Map<string, number>();
			for (const hc of response.highlightComments) {
				counts.set(hc.highlightId, hc.comments.length);
			}
			setHighlightCommentCounts(counts);
		}
	} catch (error) {
		console.error("[Gloss] Error refreshing comment summary:", error);
	}
}

async function loadCommentSummary(
	manager: HighlightManager,
	highlightIds: string[],
	appApi: GlossAppApi | null
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

		setCommentSummary(response);

		const counts = new Map<string, number>();
		for (const hc of response.highlightComments) {
			counts.set(hc.highlightId, hc.comments.length);
		}
		setHighlightCommentCounts(counts);

		console.log(
			`[Gloss] Comment summary loaded: ${response.totalComments} comments from ${response.commenters.length} people`
		);

		if (response.totalComments > 0) {
			const settingDefault = userSettings()?.commentDisplayMode === "expanded";
			const manualToggle = await loadAnnotationToggleState();
			setAnnotationsVisible(
				manualToggle !== null ? manualToggle : settingDefault
			);

			const anchoredHighlightCount = response.highlightComments.filter((hc) => {
				const active = manager.get(hc.highlightId);
				return active && active.elements.length > 0;
			}).length;

			const savedCorner = await loadIndicatorCorner();

			appApi?.setAnchoredHighlightCount(anchoredHighlightCount);
			appApi?.setIndicatorCorner(savedCorner);
		}
	} catch (error) {
		console.error("[Gloss] Error loading comment summary:", error);
	}
}

async function createHighlight(manager: HighlightManager): Promise<void> {
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
		const highlight: Highlight = {
			id,
			selector,
			color: OWN_HIGHLIGHT_COLOR,
			metadata: { userId: currentUserId() },
		};
		manager.add(highlight);
		clearSavedSelection();

		console.log("[Gloss] Created highlight:", {
			id,
			text: text.slice(0, 50),
		});

		const selection = window.getSelection();
		if (selection) selection.removeAllRanges();

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
			manager.remove(id);
			return;
		}

		console.log("[Gloss] Highlight saved:", response.highlight.id);

		const active = manager.get(id);
		if (active) {
			active.highlight.metadata = {
				...active.highlight.metadata,
				serverId: response.highlight.id,
			};
		}
	} catch (error) {
		console.error("[Gloss] Error creating highlight:", error);
		manager.remove(id);
	}
}

function toHighlight(serverHighlight: ServerHighlight): Highlight {
	const userId = currentUserId();
	const isOwnHighlight = serverHighlight.userId === userId;
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

		const converted = highlights.map(toHighlight);
		const results = manager.load(converted);

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
