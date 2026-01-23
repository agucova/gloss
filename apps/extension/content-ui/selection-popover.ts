/**
 * Selection popover for creating highlights.
 * Shows when user selects text on a page.
 */

import { type AnnotationSelector, describe } from "@gloss/anchoring";
import { DEFAULT_HIGHLIGHT_COLOR } from "./color-picker";
import {
	createPopoverContainer,
	hidePopover,
	positionPopover,
	setupDismissHandlers,
} from "./popover";

export interface SelectionPopoverOptions {
	/** Bounding rect of the selection */
	rect: DOMRect;
	/** Selected text */
	text: string;
	/** Callback when user confirms highlight */
	onHighlight: (color: string) => void;
	/** Whether user is authenticated */
	isAuthenticated?: boolean;
	/** Callback to open sign-in page */
	onSignIn?: () => void;
}

const POPOVER_ID = "gloss-selection-popover";

let currentHost: HTMLElement | null = null;
let currentPopover: HTMLElement | null = null;
let cleanupDismiss: (() => void) | null = null;
let selectedColor = DEFAULT_HIGHLIGHT_COLOR;

// Store the selector and text immediately when popover is shown,
// before the DOM can change
let savedSelector: AnnotationSelector | null = null;
let savedText: string | null = null;

/**
 * Show the selection popover near the selected text.
 */
export function showSelectionPopover(options: SelectionPopoverOptions): void {
	const { rect, text, onHighlight, isAuthenticated = true, onSignIn } = options;

	// Create selector immediately from the current selection,
	// before the DOM can change (e.g., from dynamic scripts on the page)
	const selection = window.getSelection();
	if (selection && selection.rangeCount > 0) {
		const range = selection.getRangeAt(0);
		try {
			savedSelector = describe(range, { root: document.body });
			savedText = range.toString();
		} catch (error) {
			console.error("[Gloss] Failed to describe selection:", error);
			savedSelector = null;
			savedText = null;
		}
	} else {
		savedSelector = null;
		savedText = null;
	}

	// Hide existing popover first
	hideSelectionPopover();

	// Don't show popover if we couldn't create a selector
	if (!savedSelector) {
		return;
	}

	// Create container with shadow DOM
	const { host, popover } = createPopoverContainer(POPOVER_ID);
	currentHost = host;
	currentPopover = popover;

	// Reset selected color
	selectedColor = DEFAULT_HIGHLIGHT_COLOR;

	// Build popover content
	if (isAuthenticated) {
		buildAuthenticatedContent(popover, text, onHighlight);
	} else {
		buildUnauthenticatedContent(popover, onSignIn);
	}

	// Position the popover to the right of the selection end
	positionPopover(popover, {
		targetRect: rect,
		preferredPlacement: "above",
		align: "end",
		offset: 4,
	});

	// Set up dismiss handlers
	cleanupDismiss = setupDismissHandlers(host, popover, hideSelectionPopover);
}

/**
 * Hide and remove the selection popover.
 */
export function hideSelectionPopover(): void {
	if (cleanupDismiss) {
		cleanupDismiss();
		cleanupDismiss = null;
	}

	if (currentHost && currentPopover) {
		hidePopover(currentHost, currentPopover);
		currentHost = null;
		currentPopover = null;
	}
}

/**
 * Check if the selection popover is currently visible.
 */
export function isSelectionPopoverVisible(): boolean {
	return currentHost !== null;
}

/**
 * Get the saved selector (captured when popover was shown).
 * Returns null if no selector was saved.
 */
export function getSavedSelector(): AnnotationSelector | null {
	return savedSelector;
}

/**
 * Get the saved text (captured when popover was shown).
 * Returns null if no text was saved.
 */
export function getSavedText(): string | null {
	return savedText;
}

/**
 * Clear the saved selector and text after use.
 */
export function clearSavedSelection(): void {
	savedSelector = null;
	savedText = null;
}

/**
 * Build content for authenticated users - simple highlight icon.
 */
function buildAuthenticatedContent(
	popover: HTMLElement,
	_text: string,
	onHighlight: (color: string) => void
): void {
	// Simple highlight icon button
	const highlightBtn = document.createElement("button");
	highlightBtn.className = "gloss-icon-btn";
	highlightBtn.setAttribute("aria-label", "Create highlight");
	highlightBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="m9 11-6 6v3h9l3-3"/>
		<path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
	</svg>`;

	highlightBtn.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		onHighlight(selectedColor);
		hideSelectionPopover();
	});

	popover.appendChild(highlightBtn);
}

/**
 * Build content for unauthenticated users.
 */
function buildUnauthenticatedContent(
	popover: HTMLElement,
	onSignIn?: () => void
): void {
	const container = document.createElement("div");
	container.className = "gloss-signin-prompt";

	const message = document.createElement("p");
	message.textContent = "Sign in to save highlights";
	container.appendChild(message);

	const signInBtn = document.createElement("button");
	signInBtn.className = "gloss-btn gloss-btn-primary";
	signInBtn.textContent = "Sign in";
	signInBtn.setAttribute("aria-label", "Sign in to Gloss");

	signInBtn.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (onSignIn) {
			onSignIn();
		}
		hideSelectionPopover();
	});

	container.appendChild(signInBtn);
	popover.appendChild(container);
}
