// Polyfill customElements for Chrome content scripts (isolated world has customElements === null)
// See: https://issues.chromium.org/issues/41118431
import "@webcomponents/custom-elements";
import { type Highlight, HighlightManager } from "@gloss/anchoring";

// Import Lit components (registers custom elements as side effect)
import "../content-ui/annotation-item";
import "../content-ui/comment-indicator";
import "../content-ui/comment-panel";
import "../content-ui/margin-annotations";
import "../content-ui/selection-popover";
import type { GlossCommentIndicator } from "../content-ui/comment-indicator";
import type { GlossCommentPanel } from "../content-ui/comment-panel";
import type { GlossSelectionPopover } from "../content-ui/selection-popover";

import {
	isDomainDisabled,
	loadIndicatorCorner,
	saveIndicatorCorner,
} from "../content-ui/comment-indicator";
import { ensureFontLoaded, generateId } from "../content-ui/gloss-element";
import {
	captureSelection,
	clearSavedSelection,
	getSavedSelector,
	getSavedText,
} from "../content-ui/selection-popover";
import { glossState } from "../content-ui/store";
import { OWN_HIGHLIGHT_COLOR, userHighlightColor } from "../utils/colors";
import {
	type PageCommentSummary,
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

async function loadUserSettings(): Promise<void> {
	try {
		const response = await sendMessage({ type: "GET_USER_SETTINGS" });
		if (!isErrorResponse(response)) {
			glossState.userSettings.value = response.settings;
			console.log("[Gloss] User settings loaded:", response.settings);
		}
	} catch (error) {
		console.error("[Gloss] Failed to load user settings:", error);
	}
}

async function refreshAuthState(): Promise<void> {
	try {
		const response = await sendMessage({ type: "GET_AUTH_STATUS" });
		glossState.isAuthenticated.value = response.authenticated;
		glossState.currentUserId.value = response.user?.id ?? null;
		console.log("[Gloss] Auth state:", {
			isAuthenticated: glossState.isAuthenticated.value,
			currentUserId: glossState.currentUserId.value,
		});
	} catch (error) {
		console.error("[Gloss] Failed to get auth status:", error);
		glossState.isAuthenticated.value = false;
		glossState.currentUserId.value = null;
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
				});
				return true;
			}
		});

		// Fetch initial auth state and user settings
		await refreshAuthState();
		if (glossState.isAuthenticated.value) {
			await loadUserSettings();
		}

		// Create highlight manager
		const manager = new HighlightManager({
			onEvent: (event) => {
				switch (event.type) {
					case "click": {
						const element = event.event.target as HTMLElement;
						handleHighlightClick(
							manager,
							commentPanel,
							event.highlightId,
							element
						);
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

		glossState.manager.value = manager;
		manager.observe();

		// =====================================================================
		// Create Lit components (once, attached to DOM for lifetime of script)
		// =====================================================================

		const selectionPopover = document.createElement(
			"gloss-selection-popover"
		) as GlossSelectionPopover;
		selectionPopover.isAuthenticated = glossState.isAuthenticated.value;

		const commentIndicator = document.createElement(
			"gloss-comment-indicator"
		) as GlossCommentIndicator;

		// Margin annotations reads from glossState signals automatically
		const marginAnnotations = document.createElement(
			"gloss-margin-annotations"
		);

		const commentPanel = document.createElement(
			"gloss-comment-panel"
		) as GlossCommentPanel;

		document.body.append(
			selectionPopover,
			commentIndicator,
			marginAnnotations,
			commentPanel
		);

		// =====================================================================
		// Wire up component events
		// =====================================================================

		// Selection popover events
		selectionPopover.addEventListener("gloss-highlight", async () => {
			await createHighlight(manager);
		});
		selectionPopover.addEventListener("gloss-sign-in", () => {
			browser.runtime.sendMessage({
				type: "OPEN_TAB",
				url: `${import.meta.env.VITE_WEB_URL || "http://localhost:3001"}/login`,
			});
		});

		// Comment indicator events
		commentIndicator.addEventListener("gloss-toggle-annotations", async () => {
			glossState.annotationsVisible.value =
				!glossState.annotationsVisible.value;
			await saveAnnotationToggleState(glossState.annotationsVisible.value);
			commentIndicator.annotationsVisible = glossState.annotationsVisible.value;
		});
		commentIndicator.addEventListener("gloss-corner-change", (e: Event) => {
			const detail = (e as CustomEvent).detail;
			saveIndicatorCorner(detail.corner);
		});
		commentIndicator.addEventListener("gloss-disable-domain", () => {
			commentPanel.visible = false;
			glossState.commentSummary.value = null;
			glossState.annotationsVisible.value = false;
			glossState.highlightCommentCounts.value = new Map();
			manager.clear();
		});

		// Margin annotation click → open comment panel
		marginAnnotations.addEventListener("gloss-annotation-click", (e: Event) => {
			const detail = (e as CustomEvent).detail;
			handleHighlightClick(
				manager,
				commentPanel,
				detail.highlightId,
				detail.element
			);
		});

		// Comment panel events
		commentPanel.addEventListener("gloss-create-comment", async (e: Event) => {
			const detail = (e as CustomEvent).detail;
			const serverId = commentPanel.dataset.serverId;
			if (!serverId) return;

			try {
				const response = await sendMessage({
					type: "CREATE_COMMENT",
					highlightId: serverId,
					content: detail.content,
					mentions: detail.mentions,
					parentId: detail.parentId,
				});
				if (!isErrorResponse(response)) {
					console.log("[Gloss] Comment created:", response.comment.id);
					// Reload comments for this highlight
					const commentsResp = await sendMessage({
						type: "LOAD_COMMENTS",
						highlightId: serverId,
					});
					if (!isErrorResponse(commentsResp)) {
						commentPanel.comments = commentsResp.comments;
					}
				}
			} catch (error) {
				console.error("[Gloss] Error creating comment:", error);
			}
		});

		commentPanel.addEventListener("gloss-delete-comment", async (e: Event) => {
			const detail = (e as CustomEvent).detail;
			try {
				const response = await sendMessage({
					type: "DELETE_COMMENT",
					id: detail.commentId,
				});
				if (!isErrorResponse(response)) {
					console.log("[Gloss] Comment deleted:", detail.commentId);
					// Re-fetch comment summary — margin annotations auto-update via signal
					const highlightIds =
						glossState.commentSummary.value?.highlightComments.map(
							(hc) => hc.highlightId
						) ?? [];
					if (highlightIds.length > 0) {
						await refreshCommentSummary(highlightIds);
					}
					// Also reload comments in the panel
					const serverId = commentPanel.dataset.serverId;
					if (serverId) {
						const commentsResp = await sendMessage({
							type: "LOAD_COMMENTS",
							highlightId: serverId,
						});
						if (!isErrorResponse(commentsResp)) {
							commentPanel.comments = commentsResp.comments;
						}
					}
				}
			} catch (error) {
				console.error("[Gloss] Error deleting comment:", error);
			}
		});

		commentPanel.addEventListener("gloss-delete-highlight", async () => {
			const highlightId = commentPanel.dataset.highlightId;
			const serverId = commentPanel.dataset.serverId;
			if (!(highlightId && serverId)) return;

			try {
				manager.remove(highlightId);
				const response = await sendMessage({
					type: "DELETE_HIGHLIGHT",
					id: serverId,
				});
				if (isErrorResponse(response)) {
					console.error("[Gloss] Failed to delete highlight:", response.error);
				} else {
					console.log("[Gloss] Highlight deleted");
					// Refresh summary since a highlight was removed
					const highlightIds =
						glossState.commentSummary.value?.highlightComments
							.map((hc) => hc.highlightId)
							.filter((id) => id !== serverId) ?? [];
					if (highlightIds.length > 0) {
						await refreshCommentSummary(highlightIds);
					} else {
						glossState.commentSummary.value = null;
					}
				}
			} catch (error) {
				console.error("[Gloss] Error deleting highlight:", error);
			}
		});

		commentPanel.addEventListener("gloss-search-friends", async (e: Event) => {
			const detail = (e as CustomEvent).detail;
			try {
				const response = await sendMessage({
					type: "SEARCH_FRIENDS",
					query: detail.query,
				});
				if (!isErrorResponse(response)) {
					commentPanel.setMentionResults(response.friends);
				}
			} catch (error) {
				console.error("[Gloss] Error searching friends:", error);
			}
		});

		commentPanel.addEventListener("gloss-panel-closed", async () => {
			// Re-fetch comment summary when panel closes (catches all mutations)
			const highlightIds =
				glossState.commentSummary.value?.highlightComments.map(
					(hc) => hc.highlightId
				) ?? [];
			if (highlightIds.length > 0) {
				await refreshCommentSummary(highlightIds);
			}
		});

		// =====================================================================
		// Selection handling
		// =====================================================================

		const handleMouseUp = (e: MouseEvent) => {
			setTimeout(() => {
				handleSelection(e, selectionPopover);
			}, 10);
		};
		document.addEventListener("mouseup", handleMouseUp);

		// =====================================================================
		// Load initial data
		// =====================================================================

		loadHighlights(manager).then(async (highlightIds) => {
			console.log("[Gloss] Highlights loaded");
			if (highlightIds.length > 0) {
				await loadCommentSummary(manager, commentIndicator, highlightIds);
			}
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
				selectionPopover.hide();
				commentPanel.visible = false;
				glossState.commentSummary.value = null;
				glossState.annotationsVisible.value = false;
				glossState.highlightCommentCounts.value = new Map();

				loadHighlights(manager).then(async (highlightIds) => {
					if (highlightIds.length > 0) {
						await loadCommentSummary(manager, commentIndicator, highlightIds);
					}
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
			selectionPopover.remove();
			commentIndicator.remove();
			marginAnnotations.remove();
			commentPanel.remove();
			glossState.manager.value = null;
			glossState.commentSummary.value = null;
			glossState.highlightCommentCounts.value = new Map();
			manager.destroy();
		});
	},
});

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Re-fetch comment summary and update the signal (margin annotations auto-update).
 */
async function refreshCommentSummary(highlightIds: string[]): Promise<void> {
	try {
		const response = await sendMessage({
			type: "LOAD_PAGE_COMMENT_SUMMARY",
			highlightIds,
		});
		if (!isErrorResponse(response)) {
			glossState.commentSummary.value = response;
			const counts = new Map<string, number>();
			for (const hc of response.highlightComments) {
				counts.set(hc.highlightId, hc.comments.length);
			}
			glossState.highlightCommentCounts.value = counts;
		}
	} catch (error) {
		console.error("[Gloss] Error refreshing comment summary:", error);
	}
}

/**
 * Load comment summary for all highlights on the page.
 */
async function loadCommentSummary(
	manager: HighlightManager,
	commentIndicator: GlossCommentIndicator,
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

		// Update signal — margin annotations auto-render
		glossState.commentSummary.value = response;

		// Populate comment counts
		const counts = new Map<string, number>();
		for (const hc of response.highlightComments) {
			counts.set(hc.highlightId, hc.comments.length);
		}
		glossState.highlightCommentCounts.value = counts;

		console.log(
			`[Gloss] Comment summary loaded: ${response.totalComments} comments from ${response.commenters.length} people`
		);

		if (response.totalComments > 0) {
			const settingDefault =
				glossState.userSettings.value?.commentDisplayMode === "expanded";
			const manualToggle = await loadAnnotationToggleState();
			glossState.annotationsVisible.value =
				manualToggle !== null ? manualToggle : settingDefault;

			const anchoredHighlightCount = response.highlightComments.filter((hc) => {
				const active = manager.get(hc.highlightId);
				return active && active.elements.length > 0;
			}).length;

			const savedCorner = await loadIndicatorCorner();

			// Update indicator properties
			commentIndicator.summary = response;
			commentIndicator.annotationsVisible = glossState.annotationsVisible.value;
			commentIndicator.anchoredHighlightCount = anchoredHighlightCount;
			commentIndicator.corner = savedCorner;
		}
	} catch (error) {
		console.error("[Gloss] Error loading comment summary:", error);
	}
}

/**
 * Handle text selection and show popover if valid.
 */
function handleSelection(
	e: MouseEvent,
	selectionPopover: GlossSelectionPopover
): void {
	const selection = window.getSelection();

	if (!selection || selection.isCollapsed || !selection.toString().trim()) {
		selectionPopover.hide();
		return;
	}

	const target = e.target as Element;
	if (
		target.closest(
			'input, textarea, [contenteditable="true"], .gloss-highlight'
		)
	) {
		selectionPopover.hide();
		return;
	}

	// Ignore if inside our components
	if (
		target.closest(
			"gloss-selection-popover, gloss-comment-panel, gloss-comment-indicator"
		)
	) {
		return;
	}

	// Capture selection immediately before DOM can change
	if (!captureSelection()) return;

	const range = selection.getRangeAt(0);
	const rect = range.getBoundingClientRect();

	selectionPopover.isAuthenticated = glossState.isAuthenticated.value;
	selectionPopover.show(rect);
}

/**
 * Create a highlight from the saved selector.
 */
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
			metadata: { userId: glossState.currentUserId.value },
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

/**
 * Handle click on an existing highlight — open comment panel.
 */
async function handleHighlightClick(
	manager: HighlightManager,
	commentPanel: GlossCommentPanel,
	highlightId: string,
	element: HTMLElement
): Promise<void> {
	const active = manager.get(highlightId);
	if (!active) {
		console.error("[Gloss] Highlight not found:", highlightId);
		return;
	}

	const highlightData = active.highlight;
	const currentUserId = glossState.currentUserId.value;
	const isOwner =
		(highlightData.metadata?.userId as string | undefined) === currentUserId;
	const serverId =
		(highlightData.metadata?.serverId as string | undefined) ?? highlightId;

	// Load comments
	let comments: ServerComment[] = [];
	try {
		const response = await Promise.race([
			sendMessage({ type: "LOAD_COMMENTS", highlightId: serverId }),
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

	// Store IDs for event handlers
	commentPanel.dataset.highlightId = highlightId;
	commentPanel.dataset.serverId = serverId;

	// Set properties and show
	commentPanel.highlight = active;
	commentPanel.element = element;
	commentPanel.isOwner = isOwner;
	commentPanel.currentUserId = currentUserId ?? "";
	commentPanel.comments = comments;
	commentPanel.visible = true;
}

/**
 * Convert server highlight to anchoring library format.
 */
function toHighlight(serverHighlight: ServerHighlight): Highlight {
	const currentUserId = glossState.currentUserId.value;
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
