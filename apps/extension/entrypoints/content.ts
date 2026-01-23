import { type Highlight, HighlightManager } from "@gloss/anchoring";
import {
	hideHighlightPopover,
	showHighlightPopover,
} from "../content-ui/highlight-popover";
import { generateId } from "../content-ui/popover";
import {
	hideSelectionPopover,
	showSelectionPopover,
} from "../content-ui/selection-popover";
import {
	isErrorResponse,
	type ServerHighlight,
	sendMessage,
} from "../utils/messages";

// Auth state cached for the session
let isAuthenticated = false;
let currentUserId: string | null = null;

export default defineContentScript({
	matches: ["<all_urls>"],
	runAt: "document_idle",
	async main(ctx) {
		console.log("[Gloss] Content script initialized", {
			url: location.href,
		});

		// Fetch initial auth state
		await refreshAuthState();

		// Create highlight manager with event handling
		const manager = new HighlightManager({
			onEvent: (event) => {
				switch (event.type) {
					case "click": {
						const element = event.event.target as HTMLElement;
						handleHighlightClick(manager, event.highlightId, element);
						break;
					}
					case "anchored":
						console.log(
							`[Gloss] Highlight anchored via ${event.method}:`,
							event.highlightId
						);
						break;
					case "orphaned":
						console.log("[Gloss] Highlight orphaned:", event.highlightId);
						break;
					default:
						break;
				}
			},
		});

		// Start observing for navigation and DOM mutations
		manager.observe();

		// Load highlights for current page (don't block on this)
		loadHighlights(manager).then(() => {
			console.log("[Gloss] Highlights loaded");
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
				hideHighlightPopover();
				loadHighlights(manager);
			}
		}, 500);

		// Clean up on script invalidation (extension reload, navigation, etc.)
		ctx.onInvalidated(() => {
			console.log("[Gloss] Content script invalidated, cleaning up");
			clearInterval(navigationCheck);
			document.removeEventListener("mouseup", handleMouseUp);
			hideSelectionPopover();
			hideHighlightPopover();
			manager.destroy();
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
		text: selection.toString(),
		isAuthenticated,
		onHighlight: async (color) => {
			await createHighlight(manager, color);
		},
		onSignIn: () => {
			// Open the web app login page
			browser.runtime.sendMessage({
				type: "OPEN_TAB",
				url: `${import.meta.env.VITE_SERVER_URL || "http://localhost:3000"}/login`,
			});
		},
	});
}

/**
 * Create a highlight from the saved selector (pre-computed when popover was shown).
 */
async function createHighlight(
	manager: HighlightManager,
	color: string
): Promise<void> {
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
			color,
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
			color,
		});

		if (isErrorResponse(response)) {
			console.error("[Gloss] Failed to save highlight:", response.error);
			// Remove the DOM highlight if save failed
			manager.remove(id);
			return;
		}

		console.log("[Gloss] Highlight saved:", response.highlight.id);

		// Update the highlight ID to match the server-assigned ID if different
		if (response.highlight.id !== id) {
			// The server may have assigned a different ID
			// For now, we'll keep our local ID since the DOM element uses it
			console.log(
				"[Gloss] Server assigned different ID:",
				response.highlight.id
			);
		}
	} catch (error) {
		console.error("[Gloss] Error creating highlight:", error);
		// Try to clean up the DOM highlight
		manager.remove(id);
	}
}

/**
 * Update highlight color by modifying DOM elements directly.
 */
function updateHighlightColor(
	manager: HighlightManager,
	highlightId: string,
	color: string
): void {
	const active = manager.get(highlightId);
	if (active) {
		for (const el of active.elements) {
			el.style.backgroundColor = color;
		}
		// Also update the stored color
		active.highlight.color = color;
	}
}

/**
 * Handle click on an existing highlight.
 */
function handleHighlightClick(
	manager: HighlightManager,
	highlightId: string,
	element: HTMLElement
): void {
	console.log("[Gloss] Highlight clicked:", highlightId);

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
	const originalColor = highlightData.color || "rgba(254, 240, 138, 0.5)";

	// Show the highlight popover
	showHighlightPopover({
		element,
		highlight: active,
		isOwner,
		onColorChange: isOwner
			? async (color: string) => {
					// Update locally first for immediate feedback
					updateHighlightColor(manager, highlightId, color);

					// Then save to server
					try {
						const response = await sendMessage({
							type: "UPDATE_HIGHLIGHT",
							id: highlightId,
							updates: { color },
						});

						if (isErrorResponse(response)) {
							console.error("[Gloss] Failed to update color:", response.error);
							// Revert to original color
							updateHighlightColor(manager, highlightId, originalColor);
						} else {
							console.log("[Gloss] Highlight color updated");
						}
					} catch (error) {
						console.error("[Gloss] Error updating color:", error);
						updateHighlightColor(manager, highlightId, originalColor);
					}
				}
			: undefined,
		onNoteChange: isOwner
			? async (note: string) => {
					try {
						const response = await sendMessage({
							type: "UPDATE_HIGHLIGHT",
							id: highlightId,
							updates: { note },
						});

						if (isErrorResponse(response)) {
							console.error("[Gloss] Failed to update note:", response.error);
						} else {
							console.log("[Gloss] Highlight note updated");
							// Update local metadata
							if (highlightData.metadata) {
								highlightData.metadata.note = note;
							}
						}
					} catch (error) {
						console.error("[Gloss] Error updating note:", error);
					}
				}
			: undefined,
		onDelete: isOwner
			? async () => {
					try {
						// Remove from DOM first
						manager.remove(highlightId);

						// Then delete on server
						const response = await sendMessage({
							type: "DELETE_HIGHLIGHT",
							id: highlightId,
						});

						if (isErrorResponse(response)) {
							console.error(
								"[Gloss] Failed to delete highlight:",
								response.error
							);
							// Could reload highlights to restore, but that's expensive
						} else {
							console.log("[Gloss] Highlight deleted");
						}
					} catch (error) {
						console.error("[Gloss] Error deleting highlight:", error);
					}
				}
			: undefined,
	});
}

/**
 * Convert server highlight to anchoring library format.
 */
function toHighlight(serverHighlight: ServerHighlight): Highlight {
	return {
		id: serverHighlight.id,
		selector: serverHighlight.selector,
		color: serverHighlight.color,
		metadata: {
			userId: serverHighlight.userId,
			userName: serverHighlight.user?.name,
			userImage: serverHighlight.user?.image,
			text: serverHighlight.text,
			note: serverHighlight.note,
			visibility: serverHighlight.visibility,
			createdAt: serverHighlight.createdAt,
		},
	};
}

/**
 * Load and apply highlights for the current page.
 */
async function loadHighlights(manager: HighlightManager): Promise<void> {
	const url = location.href;

	try {
		const response = await sendMessage({ type: "LOAD_HIGHLIGHTS", url });

		if (isErrorResponse(response)) {
			console.error("[Gloss] Failed to load highlights:", response.error);
			return;
		}

		const { highlights } = response;
		console.log(`[Gloss] Loading ${highlights.length} highlights for ${url}`);

		// Convert to anchoring library format and load
		const converted = highlights.map(toHighlight);
		const results = manager.load(converted);

		// Log results
		let anchored = 0;
		let orphaned = 0;
		for (const success of results.values()) {
			if (success) {
				anchored++;
			} else {
				orphaned++;
			}
		}

		console.log(
			`[Gloss] Highlights loaded: ${anchored} anchored, ${orphaned} orphaned`
		);
	} catch (error) {
		console.error("[Gloss] Error loading highlights:", error);
	}
}
