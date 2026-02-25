/**
 * HighlightManager - SPA-aware highlight lifecycle management.
 *
 * Coordinates between anchoring, highlighting, and observers to provide
 * a high-level API for managing highlights in browser extensions.
 */

import type {
	ActiveHighlight,
	AnchorResult,
	AnnotationSelector,
	Highlight,
	HighlightColor,
	HighlightEvent,
	HighlightManagerOptions,
	HighlightManagerState,
} from "./types";

import { anchor } from "./anchor";
import { describe, describeSelection } from "./describe";
import { highlightRange, injectHighlightStyles } from "./highlight";
import { DomMutationObserver } from "./observers/mutation";
import { NavigationObserver } from "./observers/navigation";

/** Default highlight color (semi-transparent yellow) */
const DEFAULT_COLOR = "rgba(255, 235, 59, 0.4)";

/** Default debounce interval for re-anchoring */
const DEFAULT_DEBOUNCE_MS = 100;

/**
 * High-level manager for highlight lifecycle in SPAs.
 *
 * Features:
 * - Add/remove highlights with automatic anchoring
 * - Create highlights from user selection
 * - Navigation detection (clears highlights on page change)
 * - DOM mutation watching (re-anchors orphaned highlights)
 * - Event callbacks for highlight interactions
 *
 * @example
 * ```typescript
 * const manager = new HighlightManager({
 *   onEvent: (event) => {
 *     if (event.type === 'click') {
 *       showHighlightPopover(event.highlightId);
 *     }
 *   },
 * });
 *
 * // Load saved highlights
 * await manager.load(savedHighlights);
 *
 * // Start observing
 * manager.observe();
 *
 * // Create from selection
 * document.addEventListener('mouseup', () => {
 *   const selector = manager.createFromSelection('new-id', '#ffff00');
 *   if (selector) {
 *     saveToDatabase(selector);
 *   }
 * });
 * ```
 */
export class HighlightManager {
	private readonly root: Element;
	private readonly debounceMs: number;
	private readonly defaultColor: HighlightColor;
	private readonly onEvent: ((event: HighlightEvent) => void) | undefined;

	// State
	private readonly highlights = new Map<string, ActiveHighlight>();
	private readonly orphaned = new Set<string>();
	private readonly pendingHighlights = new Map<string, Highlight>();

	// Observers
	private navigationObserver: NavigationObserver | null = null;
	private mutationObserver: DomMutationObserver | null = null;
	private isObserving = false;

	constructor(options: HighlightManagerOptions = {}) {
		this.root = options.root ?? document.body;
		this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
		this.defaultColor = options.defaultColor ?? DEFAULT_COLOR;
		this.onEvent = options.onEvent;
	}

	// =========================================================================
	// Core API
	// =========================================================================

	/**
	 * Add a highlight to the page.
	 *
	 * @param highlight - The highlight to add
	 * @returns AnchorResult if successful, null if orphaned
	 */
	add(highlight: Highlight): AnchorResult | null {
		// Try to anchor
		const result = anchor(highlight.selector, { root: this.root });

		if (!result) {
			// Store as orphaned for later retry
			this.orphaned.add(highlight.id);
			this.pendingHighlights.set(highlight.id, highlight);
			this.emitEvent({ type: "orphaned", highlightId: highlight.id });
			return null;
		}

		// Apply highlight to DOM
		const color = highlight.color ?? this.defaultColor;
		const { elements, cleanup } = highlightRange(result.range, {
			id: highlight.id,
			color,
			onClick: (event) =>
				this.emitEvent({ type: "click", highlightId: highlight.id, event }),
			onMouseEnter: (event) =>
				this.emitEvent({
					type: "mouseenter",
					highlightId: highlight.id,
					event,
				}),
			onMouseLeave: (event) =>
				this.emitEvent({
					type: "mouseleave",
					highlightId: highlight.id,
					event,
				}),
		});

		// Store active highlight
		const active: ActiveHighlight = {
			highlight,
			range: result.range,
			elements,
			method: result.method,
			cleanup,
		};

		this.highlights.set(highlight.id, active);
		this.orphaned.delete(highlight.id);
		this.pendingHighlights.delete(highlight.id);

		this.emitEvent({
			type: "anchored",
			highlightId: highlight.id,
			method: result.method,
		});

		return result;
	}

	/**
	 * Remove a highlight by ID.
	 */
	remove(id: string): boolean {
		const active = this.highlights.get(id);
		if (active) {
			active.cleanup();
			this.highlights.delete(id);
			return true;
		}

		// Also remove from orphaned/pending
		this.orphaned.delete(id);
		this.pendingHighlights.delete(id);
		return false;
	}

	/**
	 * Load multiple highlights.
	 *
	 * @returns Map of ID to success status
	 */
	load(highlights: Highlight[]): Map<string, boolean> {
		const results = new Map<string, boolean>();

		for (const highlight of highlights) {
			const result = this.add(highlight);
			results.set(highlight.id, result !== null);
		}

		return results;
	}

	/**
	 * Clear all highlights.
	 */
	clear(): void {
		// Clean up DOM
		for (const active of this.highlights.values()) {
			active.cleanup();
		}

		// Clear state
		this.highlights.clear();
		this.orphaned.clear();
		this.pendingHighlights.clear();
	}

	/**
	 * Create a highlight from the current browser selection.
	 *
	 * @param id - Unique ID for the new highlight
	 * @param color - Optional color
	 * @returns The selector if created, null if no valid selection
	 */
	createFromSelection(
		id: string,
		color?: HighlightColor
	): AnnotationSelector | null {
		const selector = describeSelection({ root: this.root });
		if (!selector) {
			return null;
		}

		// Add the highlight immediately
		const highlight: Highlight = { id, selector, color };
		this.add(highlight);

		return selector;
	}

	/**
	 * Create a highlight from a DOM Range.
	 */
	createFromRange(
		id: string,
		range: Range,
		color?: HighlightColor
	): AnnotationSelector | null {
		try {
			const selector = describe(range, { root: this.root });
			const highlight: Highlight = { id, selector, color };
			this.add(highlight);
			return selector;
		} catch {
			return null;
		}
	}

	// =========================================================================
	// Observation
	// =========================================================================

	/**
	 * Start observing navigation and DOM mutations.
	 */
	observe(): void {
		if (this.isObserving) {
			return;
		}
		this.isObserving = true;

		// Inject default styles
		injectHighlightStyles();

		// Watch for navigation
		this.navigationObserver = new NavigationObserver((url) => {
			this.handleNavigation(url);
		});
		this.navigationObserver.start();

		// Watch for DOM mutations
		this.mutationObserver = new DomMutationObserver(
			this.root,
			() => this.handleMutation(),
			{ debounceMs: this.debounceMs }
		);
		this.mutationObserver.start();
	}

	/**
	 * Stop observing.
	 */
	stopObserving(): void {
		if (!this.isObserving) {
			return;
		}
		this.isObserving = false;

		this.navigationObserver?.stop();
		this.navigationObserver = null;

		this.mutationObserver?.stop();
		this.mutationObserver = null;
	}

	/**
	 * Clean up everything.
	 */
	destroy(): void {
		this.stopObserving();
		this.clear();
	}

	// =========================================================================
	// State Access
	// =========================================================================

	/**
	 * Get current state.
	 */
	getState(): HighlightManagerState {
		return {
			highlights: new Map(this.highlights),
			orphaned: new Set(this.orphaned),
			url: location.href,
		};
	}

	/**
	 * Get a highlight by ID.
	 */
	get(id: string): ActiveHighlight | undefined {
		return this.highlights.get(id);
	}

	/**
	 * Check if a highlight exists.
	 */
	has(id: string): boolean {
		return this.highlights.has(id) || this.orphaned.has(id);
	}

	/**
	 * Get all highlight IDs.
	 */
	getIds(): string[] {
		return Array.from(this.highlights.keys());
	}

	/**
	 * Get orphaned highlight IDs.
	 */
	getOrphanedIds(): string[] {
		return Array.from(this.orphaned);
	}

	/**
	 * Check if observing.
	 */
	isActive(): boolean {
		return this.isObserving;
	}

	// =========================================================================
	// Private Methods
	// =========================================================================

	/**
	 * Handle navigation events.
	 */
	private handleNavigation(_url: string): void {
		// Clear all highlights on navigation
		// The extension should call load() again for the new page
		this.clear();
	}

	/**
	 * Handle DOM mutation events.
	 */
	private handleMutation(): void {
		// Try to re-anchor orphaned highlights
		this.reanchorOrphaned();
	}

	/**
	 * Try to re-anchor orphaned highlights.
	 */
	private reanchorOrphaned(): void {
		const orphanedIds = Array.from(this.orphaned);

		for (const id of orphanedIds) {
			const highlight = this.pendingHighlights.get(id);
			if (!highlight) {
				this.orphaned.delete(id);
				continue;
			}

			// Try to anchor again
			const result = anchor(highlight.selector, { root: this.root });
			if (result) {
				// Remove from orphaned and add normally
				this.orphaned.delete(id);
				this.pendingHighlights.delete(id);
				this.add(highlight);
			}
		}
	}

	/**
	 * Emit an event to the callback.
	 */
	private emitEvent(event: HighlightEvent): void {
		this.onEvent?.(event);
	}
}
