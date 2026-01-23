/**
 * Anchor selectors back to a DOM Range using a cascade fallback strategy.
 * This is the "deserialization" step for restoring highlights.
 */

import type {
	AnchorOptions,
	AnchorResult,
	AnnotationSelector,
	RangeSelector,
	TextPositionSelector,
	TextQuoteSelector,
} from "./types";
import {
	exactSearch,
	fuzzySearchWithContext,
	recommendedMaxErrors,
} from "./utils/fuzzy";
import { extractText, nodeAtOffset, normalizeText } from "./utils/text";
import { nodeFromXPath } from "./utils/xpath";

/**
 * Try to anchor using RangeSelector (XPath-based).
 * This is the fastest method but most brittle to DOM changes.
 */
function tryRangeSelector(
	selector: RangeSelector,
	root: Element
): Range | null {
	const startNode = nodeFromXPath(selector.startContainer, root);
	const endNode = nodeFromXPath(selector.endContainer, root);

	if (!(startNode && endNode)) {
		return null;
	}

	try {
		const range = document.createRange();
		range.setStart(startNode, selector.startOffset);
		range.setEnd(endNode, selector.endOffset);
		return range;
	} catch {
		// Invalid offsets or node types
		return null;
	}
}

/**
 * Try to anchor using TextPositionSelector (character offsets).
 * More reliable than XPath but can drift with content changes.
 */
function tryPositionSelector(
	selector: TextPositionSelector,
	root: Element
): Range | null {
	const startResult = nodeAtOffset(root, selector.start);
	const endResult = nodeAtOffset(root, selector.end);

	if (!(startResult && endResult)) {
		return null;
	}

	try {
		const range = document.createRange();
		range.setStart(startResult.node, startResult.offset);
		range.setEnd(endResult.node, endResult.offset);
		return range;
	} catch {
		// Invalid offsets
		return null;
	}
}

/**
 * Try to anchor using TextQuoteSelector with exact matching.
 * Slower but handles DOM restructuring if text is preserved.
 */
function tryQuoteSelectorExact(
	selector: TextQuoteSelector,
	root: Element
): Range | null {
	const text = extractText(root);
	const index = exactSearch(text, selector.exact);

	if (index === -1) {
		return null;
	}

	// If there might be multiple matches, use context to disambiguate
	const normalizedText = normalizeText(text);
	const normalizedPattern = normalizeText(selector.exact);
	const secondOccurrence = normalizedText.indexOf(normalizedPattern, index + 1);

	if (secondOccurrence !== -1) {
		// Multiple matches - need to use context
		return tryQuoteSelectorWithContext(selector, root, text);
	}

	return createRangeFromOffsets(root, index, index + selector.exact.length);
}

/**
 * Try to anchor using TextQuoteSelector with context disambiguation.
 */
function tryQuoteSelectorWithContext(
	selector: TextQuoteSelector,
	root: Element,
	text?: string
): Range | null {
	const fullText = text ?? extractText(root);

	const match = fuzzySearchWithContext(
		fullText,
		selector.exact,
		selector.prefix,
		selector.suffix,
		0 // No errors for context-based exact search
	);

	if (!match) {
		return null;
	}

	return createRangeFromOffsets(root, match.start, match.end);
}

/**
 * Try fuzzy matching as last resort.
 * Allows some edit distance errors to handle minor text changes.
 */
function tryFuzzySelector(
	selector: TextQuoteSelector,
	root: Element,
	maxErrors: number,
	positionHint?: number
): Range | null {
	const text = extractText(root);

	const match = fuzzySearchWithContext(
		text,
		selector.exact,
		selector.prefix,
		selector.suffix,
		maxErrors,
		positionHint
	);

	if (!match) {
		return null;
	}

	return createRangeFromOffsets(root, match.start, match.end);
}

/**
 * Create a Range from character offsets in a root element.
 */
function createRangeFromOffsets(
	root: Element,
	start: number,
	end: number
): Range | null {
	const startResult = nodeAtOffset(root, start);
	const endResult = nodeAtOffset(root, end);

	if (!(startResult && endResult)) {
		return null;
	}

	try {
		const range = document.createRange();
		range.setStart(startResult.node, startResult.offset);
		range.setEnd(endResult.node, endResult.offset);
		return range;
	} catch {
		return null;
	}
}

/**
 * Verify that a range's text matches the expected quote.
 */
function validateQuote(range: Range, expectedText: string): boolean {
	const actualText = normalizeText(range.toString());
	const expected = normalizeText(expectedText);
	return actualText === expected;
}

/**
 * Anchor a selector back to a DOM Range using cascade fallback.
 *
 * Tries strategies in order of speed/precision:
 * 1. RangeSelector (XPath) - fastest, verify text matches
 * 2. TextPositionSelector (offsets) - fast, verify text matches
 * 3. TextQuoteSelector (exact) - slower, uses context for disambiguation
 * 4. Fuzzy matching - slowest, allows edit distance errors
 *
 * @param selector - The stored selector to anchor
 * @param options - Optional configuration
 * @returns AnchorResult with range and method, or null if all strategies fail
 *
 * @example
 * ```typescript
 * const result = await anchor(storedSelector);
 * if (result) {
 *   console.log(`Anchored via ${result.method} with ${result.confidence} confidence`);
 *   highlightRange(result.range);
 * }
 * ```
 */
export function anchor(
	selector: AnnotationSelector,
	options: AnchorOptions = {}
): AnchorResult | null {
	const { root = document.body, maxFuzzyErrors, positionHint } = options;
	const expectedText = selector.quote.exact;

	// Strategy 1: RangeSelector (XPath-based)
	const rangeResult = tryRangeSelector(selector.range, root);
	if (rangeResult && validateQuote(rangeResult, expectedText)) {
		return {
			range: rangeResult,
			method: "range",
			confidence: 1.0,
		};
	}

	// Strategy 2: TextPositionSelector (character offsets)
	const positionResult = tryPositionSelector(selector.position, root);
	if (positionResult && validateQuote(positionResult, expectedText)) {
		return {
			range: positionResult,
			method: "position",
			confidence: 1.0,
		};
	}

	// Strategy 3: TextQuoteSelector (exact match)
	const quoteResult = tryQuoteSelectorExact(selector.quote, root);
	if (quoteResult) {
		return {
			range: quoteResult,
			method: "quote",
			confidence: 0.95,
		};
	}

	// Strategy 4: Fuzzy matching (last resort)
	const errors = maxFuzzyErrors ?? recommendedMaxErrors(expectedText.length);
	const hint = positionHint ?? selector.position.start;
	const fuzzyResult = tryFuzzySelector(selector.quote, root, errors, hint);
	if (fuzzyResult) {
		// Calculate confidence based on how different the text is
		const actualText = normalizeText(fuzzyResult.toString());
		const similarity =
			1 -
			Math.abs(actualText.length - expectedText.length) / expectedText.length;
		const confidence = Math.max(0.5, Math.min(0.9, similarity * 0.9));

		return {
			range: fuzzyResult,
			method: "fuzzy",
			confidence,
		};
	}

	// All strategies failed
	return null;
}

/**
 * Anchor multiple selectors in batch.
 * Returns a Map of ID to AnchorResult (or null for failed anchors).
 *
 * @param selectors - Map or array of [id, selector] pairs
 * @param options - Optional configuration
 */
export function anchorAll(
	selectors: Map<string, AnnotationSelector> | [string, AnnotationSelector][],
	options: AnchorOptions = {}
): Map<string, AnchorResult | null> {
	const results = new Map<string, AnchorResult | null>();
	const entries = selectors instanceof Map ? selectors.entries() : selectors;

	for (const [id, selector] of entries) {
		results.set(id, anchor(selector, options));
	}

	return results;
}

/**
 * Check if a selector can be anchored (without creating a range).
 */
export function canAnchor(
	selector: AnnotationSelector,
	options: AnchorOptions = {}
): boolean {
	return anchor(selector, options) !== null;
}
