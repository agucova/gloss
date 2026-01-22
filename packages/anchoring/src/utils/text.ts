/**
 * Text utilities for normalization and offset calculation.
 * Used by TextPositionSelector and TextQuoteSelector.
 */

/** Pattern to match and collapse whitespace */
const WHITESPACE_PATTERN = /[\t\n\r ]+/g;

/**
 * Normalize text by collapsing consecutive whitespace to single spaces.
 * This ensures consistent matching regardless of HTML formatting.
 */
export function normalizeText(text: string): string {
	return text.replace(WHITESPACE_PATTERN, " ");
}

/**
 * Extract all text content from a node using TreeWalker.
 * More efficient than textContent for selective extraction.
 */
export function extractText(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return node.textContent ?? "";
	}

	const parts: string[] = [];
	const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);

	let current = walker.nextNode();
	while (current) {
		parts.push(current.textContent ?? "");
		current = walker.nextNode();
	}

	return parts.join("");
}

/**
 * Calculate the character offset of a position within a root's textContent.
 *
 * @param root - The root element
 * @param node - The text node containing the position
 * @param offset - The offset within the text node
 * @returns Character offset from start of root's textContent, or -1 if not found
 */
export function getTextOffset(
	root: Element,
	node: Node,
	offset: number
): number {
	let position = 0;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

	let current = walker.nextNode();
	while (current) {
		if (current === node) {
			return position + offset;
		}
		position += current.textContent?.length ?? 0;
		current = walker.nextNode();
	}

	// Node not found in root
	return -1;
}

/**
 * Find the text node and offset at a given character position.
 *
 * @param root - The root element
 * @param offset - Character offset from start of root's textContent
 * @returns The node and local offset, or null if position is out of bounds
 */
export function nodeAtOffset(
	root: Element,
	offset: number
): { node: Text; offset: number } | null {
	if (offset < 0) return null;

	let position = 0;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

	let current = walker.nextNode() as Text | null;
	while (current) {
		const length = current.textContent?.length ?? 0;

		if (position + length >= offset) {
			return {
				node: current,
				offset: offset - position,
			};
		}

		position += length;
		current = walker.nextNode() as Text | null;
	}

	// Offset beyond document length
	return null;
}

/**
 * Get all text nodes within a range.
 */
export function getTextNodesInRange(range: Range): Text[] {
	const nodes: Text[] = [];
	const root = range.commonAncestorContainer;

	// If the common ancestor is a text node, return it directly
	if (root.nodeType === Node.TEXT_NODE) {
		return [root as Text];
	}

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

	let node = walker.nextNode() as Text | null;
	while (node) {
		if (range.intersectsNode(node)) {
			nodes.push(node);
		}
		node = walker.nextNode() as Text | null;
	}

	return nodes;
}

/**
 * Get the text content of a range, normalized.
 */
export function getRangeText(range: Range): string {
	return normalizeText(range.toString());
}

/**
 * Extract context (prefix/suffix) around a range.
 *
 * @param root - The root element
 * @param range - The range to get context for
 * @param length - How many characters of context to capture
 * @returns Object with prefix and suffix strings
 */
export function getContext(
	root: Element,
	range: Range,
	length: number
): { prefix: string; suffix: string } {
	const fullText = extractText(root);

	// Get start and end positions in the full text
	const startOffset = getTextOffset(
		root,
		range.startContainer,
		range.startOffset
	);
	const endOffset = getTextOffset(root, range.endContainer, range.endOffset);

	if (startOffset === -1 || endOffset === -1) {
		return { prefix: "", suffix: "" };
	}

	// Extract prefix (text before the range)
	const prefixStart = Math.max(0, startOffset - length);
	const prefix = fullText.slice(prefixStart, startOffset);

	// Extract suffix (text after the range)
	const suffixEnd = Math.min(fullText.length, endOffset + length);
	const suffix = fullText.slice(endOffset, suffixEnd);

	return {
		prefix: normalizeText(prefix).trimStart(),
		suffix: normalizeText(suffix).trimEnd(),
	};
}

/**
 * Find all occurrences of a substring in text.
 *
 * @param text - The text to search in
 * @param substring - The substring to find
 * @returns Array of start indices
 */
export function findAllOccurrences(text: string, substring: string): number[] {
	const indices: number[] = [];
	let index = text.indexOf(substring);

	while (index !== -1) {
		indices.push(index);
		index = text.indexOf(substring, index + 1);
	}

	return indices;
}

/**
 * Check if two strings are equal after normalization.
 */
export function textEquals(a: string, b: string): boolean {
	return normalizeText(a) === normalizeText(b);
}
