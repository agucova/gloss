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

import { fuzzySearchWithContext, recommendedMaxErrors } from "./utils/fuzzy";
import {
	type OffsetMapping,
	extractText,
	getTextOffset,
	nodeAtOffset,
	normalizeText,
	normalizeWithMap,
} from "./utils/text";
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
 *
 * Uses pre-computed OffsetMapping to correctly convert normalized-space
 * indices back to raw-space offsets for DOM range creation.
 */
function tryQuoteSelectorExact(
	selector: TextQuoteSelector,
	root: Element,
	mapped: OffsetMapping
): Range | null {
	const normalizedPattern = normalizeText(selector.exact);
	const index = mapped.text.indexOf(normalizedPattern);

	if (index === -1) {
		return null;
	}

	// If there might be multiple matches, use context to disambiguate
	const secondOccurrence = mapped.text.indexOf(normalizedPattern, index + 1);

	if (secondOccurrence !== -1) {
		// Multiple matches - need to use context
		return tryQuoteSelectorWithContext(selector, root, mapped);
	}

	return createRangeFromOffsets(
		root,
		mapped.toRaw(index),
		mapped.toRaw(index + normalizedPattern.length)
	);
}

/**
 * Try to anchor using TextQuoteSelector with context disambiguation.
 *
 * Passes normalized text to fuzzySearchWithContext (re-normalizing
 * already-normalized text is a no-op), then converts the returned
 * normalized indices to raw offsets via the OffsetMapping.
 */
function tryQuoteSelectorWithContext(
	selector: TextQuoteSelector,
	root: Element,
	mapped: OffsetMapping
): Range | null {
	const match = fuzzySearchWithContext(
		mapped.text,
		selector.exact,
		selector.prefix,
		selector.suffix,
		0 // No errors for context-based exact search
	);

	if (!match) {
		return null;
	}

	return createRangeFromOffsets(
		root,
		mapped.toRaw(match.start),
		mapped.toRaw(match.end)
	);
}

/**
 * Try fuzzy matching as last resort.
 * Allows some edit distance errors to handle minor text changes.
 */
function tryFuzzySelector(
	selector: TextQuoteSelector,
	root: Element,
	mapped: OffsetMapping,
	maxErrors: number,
	positionHint?: number
): Range | null {
	const match = fuzzySearchWithContext(
		mapped.text,
		selector.exact,
		selector.prefix,
		selector.suffix,
		maxErrors,
		positionHint
	);

	if (!match) {
		return null;
	}

	return createRangeFromOffsets(
		root,
		mapped.toRaw(match.start),
		mapped.toRaw(match.end)
	);
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
 * Quick context validation for fast-path strategies.
 * Checks whether the text surrounding the range matches the stored prefix/suffix.
 * Returns null if no context is available (empty prefix AND suffix).
 * Returns true/false for context match/mismatch.
 *
 * Uses normalized substring containment — no fuzzy matching, negligible cost.
 */
function quickContextMatch(
	root: Element,
	range: Range,
	quote: TextQuoteSelector
): boolean | null {
	if (!quote.prefix && !quote.suffix) {
		return null; // No context stored — caller decides confidence
	}

	const fullText = extractText(root);
	const startOffset = getTextOffset(
		root,
		range.startContainer,
		range.startOffset
	);
	const endOffset = getTextOffset(root, range.endContainer, range.endOffset);

	if (startOffset === -1 || endOffset === -1) {
		return false;
	}

	let matches = 0;
	let checks = 0;

	if (quote.prefix) {
		checks++;
		const textBefore = normalizeText(
			fullText.slice(
				Math.max(0, startOffset - quote.prefix.length - 5),
				startOffset
			)
		);
		if (textBefore.includes(normalizeText(quote.prefix))) {
			matches++;
		}
	}

	if (quote.suffix) {
		checks++;
		const textAfter = normalizeText(
			fullText.slice(endOffset, endOffset + quote.suffix.length + 5)
		);
		if (textAfter.includes(normalizeText(quote.suffix))) {
			matches++;
		}
	}

	return matches === checks;
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
		const ctx = quickContextMatch(root, rangeResult, selector.quote);
		if (ctx === true) {
			return { range: rangeResult, method: "range", confidence: 1.0 };
		}
		if (ctx === null) {
			// No context available — can't verify, slightly lower confidence
			return { range: rangeResult, method: "range", confidence: 0.9 };
		}
		// Context mismatch — text matches but wrong occurrence, continue cascade
	}

	// Strategy 2: TextPositionSelector (character offsets)
	const positionResult = tryPositionSelector(selector.position, root);
	if (positionResult && validateQuote(positionResult, expectedText)) {
		const ctx = quickContextMatch(root, positionResult, selector.quote);
		if (ctx === true) {
			return { range: positionResult, method: "position", confidence: 1.0 };
		}
		if (ctx === null) {
			return { range: positionResult, method: "position", confidence: 0.9 };
		}
		// Context mismatch — continue cascade
	}

	// Pre-compute normalized text with offset mapping for quote-based strategies.
	// This mapping allows searching in normalized space (whitespace collapsed)
	// while correctly converting result indices back to raw DOM text offsets.
	const rawText = extractText(root);
	const mapped = normalizeWithMap(rawText);

	// Strategy 3: TextQuoteSelector (exact match, uses context natively)
	const quoteResult = tryQuoteSelectorExact(selector.quote, root, mapped);
	if (quoteResult) {
		return { range: quoteResult, method: "quote", confidence: 0.95 };
	}

	// Strategy 4: Fuzzy matching (last resort)
	const errors = maxFuzzyErrors ?? recommendedMaxErrors(expectedText.length);
	const hint = positionHint ?? selector.position.start;
	const fuzzyResult = tryFuzzySelector(
		selector.quote,
		root,
		mapped,
		errors,
		hint
	);
	if (fuzzyResult) {
		const actualText = normalizeText(fuzzyResult.toString());
		const similarity =
			1 -
			Math.abs(actualText.length - expectedText.length) / expectedText.length;
		const confidence = Math.max(0.5, Math.min(0.85, similarity * 0.85));

		return { range: fuzzyResult, method: "fuzzy", confidence };
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
