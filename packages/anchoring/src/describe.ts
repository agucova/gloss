/**
 * Convert a DOM Range to all three selector types.
 * This is the "serialization" step for storing highlights.
 */

import {
	type AnnotationSelector,
	DescribeError,
	type DescribeOptions,
	type RangeSelector,
	type TextPositionSelector,
	type TextQuoteSelector,
} from "./types";
import { getContext, getTextOffset, normalizeText } from "./utils/text";
import { xpathFromNode } from "./utils/xpath";

/** Default context length for prefix/suffix */
const DEFAULT_CONTEXT_LENGTH = 32;

/**
 * Create a RangeSelector from a DOM Range.
 * Stores XPath references to start and end nodes with offsets.
 */
function createRangeSelector(range: Range, root: Element): RangeSelector {
	return {
		type: "RangeSelector",
		startContainer: xpathFromNode(range.startContainer, root),
		startOffset: range.startOffset,
		endContainer: xpathFromNode(range.endContainer, root),
		endOffset: range.endOffset,
	};
}

/**
 * Create a TextPositionSelector from a DOM Range.
 * Stores character offsets relative to root's textContent.
 */
function createTextPositionSelector(
	range: Range,
	root: Element
): TextPositionSelector {
	const start = getTextOffset(root, range.startContainer, range.startOffset);
	const end = getTextOffset(root, range.endContainer, range.endOffset);

	if (start === -1 || end === -1) {
		throw new DescribeError("Range is not within root element");
	}

	return {
		type: "TextPositionSelector",
		start,
		end,
	};
}

/**
 * Create a TextQuoteSelector from a DOM Range.
 * Stores the exact text with surrounding context for fuzzy matching.
 */
function createTextQuoteSelector(
	range: Range,
	root: Element,
	contextLength: number
): TextQuoteSelector {
	const exact = normalizeText(range.toString());

	if (exact.length === 0) {
		throw new DescribeError("Range contains no text");
	}

	const context = getContext(root, range, contextLength);

	return {
		type: "TextQuoteSelector",
		exact,
		prefix: context.prefix,
		suffix: context.suffix,
	};
}

/**
 * Convert a DOM Range to all three selector types.
 *
 * This generates a complete AnnotationSelector that can be stored and later
 * used to re-anchor the highlight on the same or similar page content.
 *
 * @param range - The DOM Range to describe
 * @param options - Optional configuration
 * @returns All three selector types bundled together
 *
 * @example
 * ```typescript
 * const selection = window.getSelection();
 * const range = selection.getRangeAt(0);
 * const selector = describe(range);
 * // Store selector in database, later use anchor() to restore
 * ```
 */
export function describe(
	range: Range,
	options: DescribeOptions = {}
): AnnotationSelector {
	const { root = document.body, contextLength = DEFAULT_CONTEXT_LENGTH } =
		options;

	// Validate range
	if (range.collapsed) {
		throw new DescribeError("Cannot describe a collapsed range");
	}

	// Ensure range is within root
	if (!root.contains(range.commonAncestorContainer)) {
		throw new DescribeError("Range is not contained within root element");
	}

	// Generate all three selectors
	const rangeSelector = createRangeSelector(range, root);
	const positionSelector = createTextPositionSelector(range, root);
	const quoteSelector = createTextQuoteSelector(range, root, contextLength);

	return {
		range: rangeSelector,
		position: positionSelector,
		quote: quoteSelector,
	};
}

/**
 * Describe the current browser selection.
 * Convenience wrapper around describe().
 *
 * @param options - Optional configuration
 * @returns The selector, or null if nothing is selected
 *
 * @example
 * ```typescript
 * document.addEventListener('mouseup', () => {
 *   const selector = describeSelection();
 *   if (selector) {
 *     console.log('User selected:', selector.quote.exact);
 *   }
 * });
 * ```
 */
export function describeSelection(
	options: DescribeOptions = {}
): AnnotationSelector | null {
	const selection = window.getSelection();

	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
		return null;
	}

	try {
		const range = selection.getRangeAt(0);
		return describe(range, options);
	} catch {
		// Selection might be in an invalid state
		return null;
	}
}
