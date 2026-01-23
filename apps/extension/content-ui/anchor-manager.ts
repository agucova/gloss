/**
 * AnchorManager - Manages invisible anchor elements for comment positioning.
 *
 * Creates zero-dimension anchor spans injected after highlight <mark> elements.
 * These anchors flow naturally with the document and serve as positioning
 * references for Floating UI-based annotations.
 */

import type { HighlightManager } from "@gloss/anchoring";

const ANCHOR_CLASS = "gloss-anchor";
const DATA_HIGHLIGHT_ID = "data-gloss-anchor-id";

export interface AnchorManagerOptions {
	/** The HighlightManager to sync anchors with */
	manager: HighlightManager;
	/** Called when an anchor is created and ready */
	onAnchorReady?: (highlightId: string, anchor: HTMLElement) => void;
	/** Called when an anchor is removed */
	onAnchorRemoved?: (highlightId: string) => void;
}

/**
 * Manages anchor elements that track highlight positions naturally.
 *
 * Instead of using fixed positioning with scroll handlers, anchors are
 * injected into the DOM after highlight elements. They flow naturally
 * with page content, making them reliable positioning references.
 */
export class AnchorManager {
	private readonly manager: HighlightManager;
	private readonly anchors = new Map<string, HTMLElement>();
	private readonly onAnchorReady?: (
		highlightId: string,
		anchor: HTMLElement
	) => void;
	private readonly onAnchorRemoved?: (highlightId: string) => void;

	constructor(options: AnchorManagerOptions) {
		this.manager = options.manager;
		this.onAnchorReady = options.onAnchorReady;
		this.onAnchorRemoved = options.onAnchorRemoved;
	}

	/**
	 * Create an anchor for a highlight.
	 * The anchor is inserted after the first <mark> element of the highlight.
	 */
	createAnchor(highlightId: string): HTMLElement | null {
		// Don't create duplicates
		if (this.anchors.has(highlightId)) {
			return this.anchors.get(highlightId) ?? null;
		}

		const active = this.manager.get(highlightId);
		if (!active || active.elements.length === 0) {
			return null;
		}

		// Get the first mark element
		const firstMark = active.elements[0];

		// Create invisible anchor span
		const anchor = document.createElement("span");
		anchor.className = ANCHOR_CLASS;
		anchor.setAttribute(DATA_HIGHLIGHT_ID, highlightId);

		// Make it invisible but maintain position in document flow
		anchor.style.cssText = `
			display: inline;
			width: 0;
			height: 0;
			overflow: hidden;
			visibility: hidden;
			pointer-events: none;
		`;

		// Insert after the first mark element
		firstMark.insertAdjacentElement("afterend", anchor);

		this.anchors.set(highlightId, anchor);
		this.onAnchorReady?.(highlightId, anchor);

		return anchor;
	}

	/**
	 * Create anchors for all active highlights.
	 */
	createAnchorsForAll(): void {
		const ids = this.manager.getIds();
		for (const id of ids) {
			this.createAnchor(id);
		}
	}

	/**
	 * Get the anchor element for a highlight.
	 */
	getAnchor(highlightId: string): HTMLElement | null {
		return this.anchors.get(highlightId) ?? null;
	}

	/**
	 * Get the first <mark> element for a highlight.
	 * Useful as an alternative anchor when the anchor span isn't available.
	 */
	getHighlightElement(highlightId: string): HTMLElement | null {
		const active = this.manager.get(highlightId);
		return active?.elements[0] ?? null;
	}

	/**
	 * Check if an anchor exists for a highlight.
	 */
	hasAnchor(highlightId: string): boolean {
		return this.anchors.has(highlightId);
	}

	/**
	 * Remove an anchor by highlight ID.
	 */
	removeAnchor(highlightId: string): boolean {
		const anchor = this.anchors.get(highlightId);
		if (!anchor) {
			return false;
		}

		anchor.remove();
		this.anchors.delete(highlightId);
		this.onAnchorRemoved?.(highlightId);
		return true;
	}

	/**
	 * Remove all anchors.
	 */
	clear(): void {
		for (const [id, anchor] of this.anchors) {
			anchor.remove();
			this.onAnchorRemoved?.(id);
		}
		this.anchors.clear();
	}

	/**
	 * Sync anchors with the current state of the HighlightManager.
	 * Creates missing anchors and removes orphaned ones.
	 */
	sync(): void {
		const activeIds = new Set(this.manager.getIds());

		// Remove anchors for highlights that no longer exist
		for (const id of this.anchors.keys()) {
			if (!activeIds.has(id)) {
				this.removeAnchor(id);
			}
		}

		// Create anchors for new highlights
		for (const id of activeIds) {
			if (!this.anchors.has(id)) {
				this.createAnchor(id);
			}
		}
	}

	/**
	 * Get all anchor IDs.
	 */
	getIds(): string[] {
		return Array.from(this.anchors.keys());
	}

	/**
	 * Get the count of anchors.
	 */
	get size(): number {
		return this.anchors.size;
	}

	/**
	 * Clean up all anchors and resources.
	 */
	destroy(): void {
		this.clear();
	}
}
