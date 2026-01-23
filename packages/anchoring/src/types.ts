/**
 * Text anchoring types following W3C Web Annotation Data Model patterns.
 * @see https://www.w3.org/TR/annotation-model/#selectors
 */

// ============================================================================
// Selector Types
// ============================================================================

/**
 * XPath-based range selector for precise DOM positioning.
 * Most precise but brittle to DOM changes.
 */
export interface RangeSelector {
	type: "RangeSelector";
	/** XPath to start container node (relative to root) */
	startContainer: string;
	/** Character offset within start container */
	startOffset: number;
	/** XPath to end container node (relative to root) */
	endContainer: string;
	/** Character offset within end container */
	endOffset: number;
}

/**
 * Character position selector based on textContent offsets.
 * More reliable than XPath but can drift with content changes.
 */
export interface TextPositionSelector {
	type: "TextPositionSelector";
	/** Start character offset in root's textContent */
	start: number;
	/** End character offset in root's textContent */
	end: number;
}

/**
 * Text quote selector with surrounding context.
 * Most robust to page changes via fuzzy matching.
 */
export interface TextQuoteSelector {
	type: "TextQuoteSelector";
	/** The exact highlighted text */
	exact: string;
	/** Text immediately before the highlight (~32 chars) */
	prefix: string;
	/** Text immediately after the highlight (~32 chars) */
	suffix: string;
}

/**
 * All three selector types stored together for maximum resilience.
 * Anchoring tries each in order until one succeeds.
 */
export interface AnnotationSelector {
	range: RangeSelector;
	position: TextPositionSelector;
	quote: TextQuoteSelector;
}

// ============================================================================
// Anchoring Types
// ============================================================================

/** Strategy used to anchor a selector */
export type AnchorMethod = "range" | "position" | "quote" | "fuzzy";

/**
 * Result of successfully anchoring a selector to the DOM.
 */
export interface AnchorResult {
	/** The DOM Range representing the anchored highlight */
	range: Range;
	/** Which anchoring strategy succeeded */
	method: AnchorMethod;
	/** Confidence score (0-1). Lower for fuzzy matches. */
	confidence: number;
}

/**
 * Options for the describe() function.
 */
export interface DescribeOptions {
	/** Root element to describe relative to (defaults to document.body) */
	root?: Element;
	/** Length of prefix/suffix context (defaults to 32) */
	contextLength?: number;
}

/**
 * Options for the anchor() function.
 */
export interface AnchorOptions {
	/** Root element to anchor within (defaults to document.body) */
	root?: Element;
	/** Maximum errors allowed for fuzzy matching (defaults to 10% of quote length) */
	maxFuzzyErrors?: number;
	/** Position hint for faster fuzzy search */
	positionHint?: number;
}

// ============================================================================
// Highlight Types
// ============================================================================

/** CSS color value */
export type HighlightColor = string;

/**
 * Options for highlighting a range.
 */
export interface HighlightOptions {
	/** Unique identifier for the highlight */
	id: string;
	/** Background color (CSS value) */
	color?: HighlightColor;
	/** CSS class to add to highlight elements */
	className?: string;
	/** Click handler for highlight elements */
	onClick?: (event: MouseEvent) => void;
	/** Mouseenter handler */
	onMouseEnter?: (event: MouseEvent) => void;
	/** Mouseleave handler */
	onMouseLeave?: (event: MouseEvent) => void;
}

/**
 * Result of highlighting a range.
 */
export interface HighlightResult {
	/** The <mark> elements created */
	elements: HTMLElement[];
	/** Function to remove the highlight and restore original DOM */
	cleanup: () => void;
}

// ============================================================================
// Manager Types
// ============================================================================

/**
 * A highlight with its selector and metadata.
 */
export interface Highlight {
	/** Unique identifier */
	id: string;
	/** The selector for re-anchoring */
	selector: AnnotationSelector;
	/** Display color */
	color?: HighlightColor;
	/** Additional metadata (user ID, timestamp, etc.) */
	metadata?: Record<string, unknown>;
}

/**
 * An active highlight with DOM state.
 */
export interface ActiveHighlight {
	/** The highlight definition */
	highlight: Highlight;
	/** Current DOM range (null if orphaned) */
	range: Range | null;
	/** The <mark> elements in the DOM */
	elements: HTMLElement[];
	/** Anchoring method that succeeded */
	method: AnchorMethod | null;
	/** Function to remove from DOM */
	cleanup: () => void;
}

/**
 * Events emitted by HighlightManager.
 */
export type HighlightEvent =
	| { type: "click"; highlightId: string; event: MouseEvent }
	| { type: "mouseenter"; highlightId: string; event: MouseEvent }
	| { type: "mouseleave"; highlightId: string; event: MouseEvent }
	| { type: "anchored"; highlightId: string; method: AnchorMethod }
	| { type: "orphaned"; highlightId: string };

/**
 * Options for HighlightManager.
 */
export interface HighlightManagerOptions {
	/** Root element (defaults to document.body) */
	root?: Element;
	/** Debounce interval for re-anchoring after DOM changes (ms) */
	debounceMs?: number;
	/** Default highlight color */
	defaultColor?: HighlightColor;
	/** Event callback */
	onEvent?: (event: HighlightEvent) => void;
}

/**
 * Current state of the HighlightManager.
 */
export interface HighlightManagerState {
	/** Active highlights by ID */
	highlights: Map<string, ActiveHighlight>;
	/** IDs of highlights that couldn't be anchored */
	orphaned: Set<string>;
	/** Current URL being tracked */
	url: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when describing a range fails.
 */
export class DescribeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DescribeError";
	}
}

/**
 * Error thrown when anchoring a selector fails.
 */
export class AnchorError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AnchorError";
	}
}

// ============================================================================
// Curius Compatibility
// ============================================================================

/**
 * Curius highlight position format.
 * @see packages/curius/src/schemas.ts
 */
export interface CuriusHighlightPosition {
	rawHighlight: string;
	leftContext: string;
	rightContext: string;
}

/**
 * Convert Curius position format to TextQuoteSelector.
 */
export function fromCuriusPosition(
	position: CuriusHighlightPosition
): TextQuoteSelector {
	return {
		type: "TextQuoteSelector",
		exact: position.rawHighlight,
		prefix: position.leftContext,
		suffix: position.rightContext,
	};
}

/**
 * Convert TextQuoteSelector to Curius position format.
 */
export function toCuriusPosition(
	selector: TextQuoteSelector
): CuriusHighlightPosition {
	return {
		rawHighlight: selector.exact,
		leftContext: selector.prefix,
		rightContext: selector.suffix,
	};
}
