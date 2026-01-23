/**
 * Highlight popover for viewing/editing existing highlights.
 * Shows when user clicks on a highlight.
 */

import type { ActiveHighlight, Highlight } from "@gloss/anchoring";
import { createColorPicker, updateColorPickerSelection } from "./color-picker";
import {
	createPopoverContainer,
	hidePopover,
	positionPopover,
	setupDismissHandlers,
} from "./popover";

/** Helper to get highlight data from ActiveHighlight */
function getHighlightData(active: ActiveHighlight): Highlight {
	return active.highlight;
}

export interface HighlightPopoverOptions {
	/** The highlight element that was clicked */
	element: HTMLElement;
	/** The highlight data */
	highlight: ActiveHighlight;
	/** Whether current user owns this highlight */
	isOwner: boolean;
	/** Callback when color changes */
	onColorChange?: (color: string) => void;
	/** Callback when note changes */
	onNoteChange?: (note: string) => void;
	/** Callback when highlight is deleted */
	onDelete?: () => void;
}

const POPOVER_ID = "gloss-highlight-popover";

let currentHost: HTMLElement | null = null;
let currentPopover: HTMLElement | null = null;
let cleanupDismiss: (() => void) | null = null;

/**
 * Show the highlight popover anchored to the clicked highlight.
 */
export function showHighlightPopover(options: HighlightPopoverOptions): void {
	const { element, highlight, isOwner, onColorChange, onNoteChange, onDelete } =
		options;

	// Hide existing popover first
	hideHighlightPopover();

	// Create container with shadow DOM
	const { host, popover } = createPopoverContainer(POPOVER_ID);
	currentHost = host;
	currentPopover = popover;

	// Build popover content
	const container = document.createElement("div");
	container.className = "gloss-flex gloss-flex-col gloss-gap-2";

	// Build content based on ownership
	if (isOwner) {
		buildOwnerContent(
			container,
			highlight,
			onColorChange,
			onNoteChange,
			onDelete
		);
	} else {
		buildFriendContent(container, highlight);
	}

	popover.appendChild(container);

	// Position the popover relative to the highlight element
	const rect = element.getBoundingClientRect();
	positionPopover(popover, {
		targetRect: rect,
		preferredPlacement: "above",
		align: "center",
		offset: 8,
	});

	// Set up dismiss handlers
	cleanupDismiss = setupDismissHandlers(host, popover, hideHighlightPopover);
}

/**
 * Hide and remove the highlight popover.
 */
export function hideHighlightPopover(): void {
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
 * Check if the highlight popover is currently visible.
 */
export function isHighlightPopoverVisible(): boolean {
	return currentHost !== null;
}

/** Helper to get metadata value safely */
function getMetadata(active: ActiveHighlight, key: string): string | undefined {
	const data = getHighlightData(active);
	return data.metadata?.[key] as string | undefined;
}

/**
 * Build content for the owner's own highlight.
 */
function buildOwnerContent(
	container: HTMLElement,
	active: ActiveHighlight,
	onColorChange?: (color: string) => void,
	onNoteChange?: (note: string) => void,
	onDelete?: () => void
): void {
	const data = getHighlightData(active);

	// Color picker
	if (onColorChange) {
		const colorPicker = createColorPicker({
			selected: data.color || "rgba(254, 240, 138, 0.5)",
			onChange: (color: string) => {
				onColorChange(color);
				// Update the selection state in the picker
				updateColorPickerSelection(colorPicker, color);
			},
		});
		container.appendChild(colorPicker);
	}

	// Note section
	if (onNoteChange) {
		const noteSection = document.createElement("div");
		noteSection.className = "gloss-flex gloss-flex-col gloss-gap-1";

		// Note textarea
		const noteInput = document.createElement("textarea");
		noteInput.className = "gloss-input";
		noteInput.placeholder = "Add a note...";
		noteInput.value = getMetadata(active, "note") || "";
		noteInput.rows = 2;

		// Save note on blur
		noteInput.addEventListener("blur", () => {
			const newNote = noteInput.value.trim();
			const oldNote = getMetadata(active, "note") || "";
			if (newNote !== oldNote) {
				onNoteChange(newNote);
			}
		});

		// Also save on Enter (but allow Shift+Enter for newlines)
		noteInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				noteInput.blur();
			}
		});

		noteSection.appendChild(noteInput);
		container.appendChild(noteSection);
	}

	// Divider
	const divider = document.createElement("div");
	divider.className = "gloss-divider";
	container.appendChild(divider);

	// Action row
	const actionRow = document.createElement("div");
	actionRow.className = "gloss-flex gloss-items-center gloss-justify-between";

	// Timestamp
	const timestamp = document.createElement("span");
	timestamp.className = "gloss-text-muted gloss-text-sm";
	timestamp.textContent = formatRelativeTime(getMetadata(active, "createdAt"));
	actionRow.appendChild(timestamp);

	// Delete button
	if (onDelete) {
		const deleteBtn = document.createElement("button");
		deleteBtn.className = "gloss-btn gloss-btn-danger";
		deleteBtn.textContent = "Delete";
		deleteBtn.setAttribute("aria-label", "Delete highlight");

		deleteBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			onDelete();
			hideHighlightPopover();
		});

		actionRow.appendChild(deleteBtn);
	}

	container.appendChild(actionRow);
}

/**
 * Build content for a friend's highlight.
 */
function buildFriendContent(
	container: HTMLElement,
	active: ActiveHighlight
): void {
	const data = getHighlightData(active);

	// User info row
	const userRow = document.createElement("div");
	userRow.className = "gloss-user-info";

	// User dot (colored circle)
	const userDot = document.createElement("div");
	userDot.className = "gloss-user-dot";
	userDot.style.backgroundColor = data.color || "rgba(254, 240, 138, 0.5)";
	userRow.appendChild(userDot);

	// User name
	const userName = document.createElement("span");
	userName.className = "gloss-user-name";
	userName.textContent = `Highlighted by ${getMetadata(active, "userName") || "a friend"}`;
	userRow.appendChild(userName);

	container.appendChild(userRow);

	// Note if present
	const note = getMetadata(active, "note");
	if (note) {
		const noteDisplay = document.createElement("p");
		noteDisplay.className = "gloss-text-sm";
		noteDisplay.textContent = note;
		noteDisplay.style.fontStyle = "italic";
		noteDisplay.style.padding = "4px 0";
		container.appendChild(noteDisplay);
	}

	// Timestamp
	const timestamp = document.createElement("span");
	timestamp.className = "gloss-text-muted gloss-text-sm";
	timestamp.textContent = formatRelativeTime(getMetadata(active, "createdAt"));
	container.appendChild(timestamp);
}

/**
 * Format a timestamp as relative time (e.g., "2h ago", "3d ago").
 */
function formatRelativeTime(dateString?: string): string {
	if (!dateString) {
		return "";
	}

	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSeconds < 60) {
		return "just now";
	}
	if (diffMinutes < 60) {
		return `${diffMinutes}m ago`;
	}
	if (diffHours < 24) {
		return `${diffHours}h ago`;
	}
	if (diffDays < 30) {
		return `${diffDays}d ago`;
	}

	return date.toLocaleDateString();
}
