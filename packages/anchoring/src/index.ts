/**
 * @gloss/anchoring - Text anchoring library for browser extensions
 *
 * Provides reliable text highlighting with a three-layer fallback strategy:
 * 1. RangeSelector (XPath) - fastest, most brittle
 * 2. TextPositionSelector (offsets) - reliable
 * 3. TextQuoteSelector (text + context) - most robust
 *
 * @example
 * ```typescript
 * import { HighlightManager, describe, anchor } from '@gloss/anchoring';
 *
 * // High-level: Use HighlightManager
 * const manager = new HighlightManager();
 * manager.observe();
 * await manager.load(savedHighlights);
 *
 * // Low-level: Use describe/anchor directly
 * const selector = describe(range);
 * const result = anchor(selector);
 * ```
 */

export { anchor, anchorAll, canAnchor } from "./anchor";
// Core functions
export { describe, describeSelection } from "./describe";

// Highlighting
export {
	findHighlightFromEvent,
	getHighlightElements,
	getHighlightElementsById,
	getHighlightId,
	HIGHLIGHT_STYLES,
	highlightRange,
	injectHighlightStyles,
	isHighlightElement,
	removeAllHighlights,
	removeHighlightById,
	updateHighlightColor,
} from "./highlight";

// Manager
export { HighlightManager } from "./manager";
export { DomMutationObserver, debounce } from "./observers/mutation";
// Observers (for advanced use)
export { NavigationObserver } from "./observers/navigation";
// Types
export type {
	ActiveHighlight,
	// Anchoring
	AnchorMethod,
	AnchorOptions,
	AnchorResult,
	AnnotationSelector,
	// Curius compatibility
	CuriusHighlightPosition,
	DescribeOptions,
	// Manager
	Highlight,
	// Highlighting
	HighlightColor,
	HighlightEvent,
	HighlightManagerOptions,
	HighlightManagerState,
	HighlightOptions,
	HighlightResult,
	// Selectors
	RangeSelector,
	TextPositionSelector,
	TextQuoteSelector,
} from "./types";
// Error classes
// Curius compatibility helpers
export {
	AnchorError,
	DescribeError,
	fromCuriusPosition,
	toCuriusPosition,
} from "./types";
export {
	exactSearch,
	type FuzzyMatch,
	fuzzySearch,
	fuzzySearchWithContext,
	recommendedMaxErrors,
} from "./utils/fuzzy";
export {
	extractText,
	findAllOccurrences,
	getContext,
	getRangeText,
	getTextNodesInRange,
	getTextOffset,
	nodeAtOffset,
	normalizeText,
	textEquals,
} from "./utils/text";
// Utilities (for advanced use)
export {
	getCommonAncestor,
	isDescendantOf,
	nodeFromXPath,
	xpathFromNode,
} from "./utils/xpath";
