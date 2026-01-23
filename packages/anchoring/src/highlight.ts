/**
 * DOM highlighting utilities.
 * Wraps DOM Ranges in <mark> elements for visual display.
 */

import type { HighlightOptions, HighlightResult } from "./types";
import { getTextNodesInRange } from "./utils/text";

/** Default CSS class for highlight elements */
const DEFAULT_CLASS = "gloss-highlight";

/** Data attribute for highlight IDs */
const DATA_HIGHLIGHT_ID = "data-gloss-id";

/**
 * Highlight a DOM Range by wrapping it in <mark> elements.
 *
 * This handles ranges that span multiple text nodes by creating
 * multiple <mark> elements as needed. Returns a cleanup function
 * to remove the highlights.
 *
 * @param range - The DOM Range to highlight
 * @param options - Highlight configuration
 * @returns Object with elements array and cleanup function
 *
 * @example
 * ```typescript
 * const result = highlightRange(range, {
 *   id: 'highlight-1',
 *   color: '#ffff00',
 *   onClick: (e) => console.log('Clicked highlight'),
 * });
 *
 * // Later, to remove:
 * result.cleanup();
 * ```
 */
export function highlightRange(
	range: Range,
	options: HighlightOptions
): HighlightResult {
	const {
		id,
		color,
		className = DEFAULT_CLASS,
		onClick,
		onMouseEnter,
		onMouseLeave,
	} = options;

	const elements: HTMLElement[] = [];
	const textNodes = getTextNodesInRange(range);

	// Track nodes we need to process (can't modify during iteration)
	const nodesToWrap: Array<{
		node: Text;
		start: number;
		end: number;
	}> = [];

	for (const textNode of textNodes) {
		// Calculate which portion of this text node is in the range
		let start = 0;
		let end = textNode.length;

		if (textNode === range.startContainer) {
			start = range.startOffset;
		}
		if (textNode === range.endContainer) {
			end = range.endOffset;
		}

		// Skip if no text to highlight
		if (start >= end) {
			continue;
		}

		nodesToWrap.push({ node: textNode, start, end });
	}

	// Now wrap the nodes (modifications happen here)
	for (const { node, start, end } of nodesToWrap) {
		const mark = createHighlightElement(id, className, color);

		// Attach event handlers
		if (onClick) {
			mark.addEventListener("click", onClick);
		}
		if (onMouseEnter) {
			mark.addEventListener("mouseenter", onMouseEnter);
		}
		if (onMouseLeave) {
			mark.addEventListener("mouseleave", onMouseLeave);
		}

		// Wrap the text portion
		wrapTextNode(node, start, end, mark);
		elements.push(mark);
	}

	// Create cleanup function
	const cleanup = () => {
		for (const mark of elements) {
			// Remove event listeners
			if (onClick) {
				mark.removeEventListener("click", onClick);
			}
			if (onMouseEnter) {
				mark.removeEventListener("mouseenter", onMouseEnter);
			}
			if (onMouseLeave) {
				mark.removeEventListener("mouseleave", onMouseLeave);
			}

			// Unwrap the element
			unwrapElement(mark);
		}
	};

	return { elements, cleanup };
}

/**
 * Create a <mark> element with the given options.
 */
function createHighlightElement(
	id: string,
	className: string,
	color?: string
): HTMLElement {
	const mark = document.createElement("mark");
	mark.className = className;
	mark.setAttribute(DATA_HIGHLIGHT_ID, id);

	if (color) {
		mark.style.backgroundColor = color;
	}

	return mark;
}

/**
 * Wrap a portion of a text node in a highlight element.
 *
 * @param node - The text node to wrap
 * @param start - Start offset within the node
 * @param end - End offset within the node
 * @param wrapper - The element to wrap with
 */
function wrapTextNode(
	node: Text,
	start: number,
	end: number,
	wrapper: HTMLElement
): void {
	const parent = node.parentNode;
	if (!parent) {
		return;
	}

	const text = node.textContent ?? "";

	// Split into: before | highlighted | after
	const beforeText = text.slice(0, start);
	const highlightedText = text.slice(start, end);
	const afterText = text.slice(end);

	// Create the new structure
	const fragment = document.createDocumentFragment();

	if (beforeText) {
		fragment.appendChild(document.createTextNode(beforeText));
	}

	wrapper.textContent = highlightedText;
	fragment.appendChild(wrapper);

	if (afterText) {
		fragment.appendChild(document.createTextNode(afterText));
	}

	// Replace the original node
	parent.replaceChild(fragment, node);
}

/**
 * Unwrap a highlight element, restoring the original text structure.
 */
function unwrapElement(element: HTMLElement): void {
	const parent = element.parentNode;
	if (!parent) {
		return;
	}

	// Move all children before the element
	while (element.firstChild) {
		parent.insertBefore(element.firstChild, element);
	}

	// Remove the now-empty element
	parent.removeChild(element);

	// Normalize to merge adjacent text nodes
	parent.normalize();
}

/**
 * Get all highlight elements within a root.
 */
export function getHighlightElements(
	root: Element = document.body
): HTMLElement[] {
	const selector = `[${DATA_HIGHLIGHT_ID}]`;
	return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

/**
 * Get highlight elements by ID.
 */
export function getHighlightElementsById(
	id: string,
	root: Element = document.body
): HTMLElement[] {
	const selector = `[${DATA_HIGHLIGHT_ID}="${id}"]`;
	return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

/**
 * Remove all highlight elements with a given ID.
 */
export function removeHighlightById(
	id: string,
	root: Element = document.body
): void {
	const elements = getHighlightElementsById(id, root);
	for (const element of elements) {
		unwrapElement(element);
	}
}

/**
 * Remove all highlights within a root.
 */
export function removeAllHighlights(root: Element = document.body): void {
	const elements = getHighlightElements(root);
	for (const element of elements) {
		unwrapElement(element);
	}
}

/**
 * Get the highlight ID from a highlight element.
 */
export function getHighlightId(element: HTMLElement): string | null {
	return element.getAttribute(DATA_HIGHLIGHT_ID);
}

/**
 * Check if an element is a highlight element.
 */
export function isHighlightElement(element: Element): boolean {
	return element.hasAttribute(DATA_HIGHLIGHT_ID);
}

/**
 * Find the nearest highlight element from an event target.
 * Useful for click handlers on the document.
 */
export function findHighlightFromEvent(event: Event): HTMLElement | null {
	const target = event.target;
	if (!(target instanceof Element)) {
		return null;
	}

	return target.closest(`[${DATA_HIGHLIGHT_ID}]`) as HTMLElement | null;
}

/**
 * Update the color of highlight elements by ID.
 */
export function updateHighlightColor(
	id: string,
	color: string,
	root: Element = document.body
): void {
	const elements = getHighlightElementsById(id, root);
	for (const element of elements) {
		element.style.backgroundColor = color;
	}
}

/**
 * CSS for default highlight styles.
 * Can be injected into the document head.
 */
export const HIGHLIGHT_STYLES = `
.${DEFAULT_CLASS} {
  background-color: rgba(255, 235, 59, 0.4);
  border-radius: 2px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.${DEFAULT_CLASS}:hover {
  background-color: rgba(255, 235, 59, 0.6);
}

.${DEFAULT_CLASS}[data-active="true"] {
  background-color: rgba(255, 235, 59, 0.8);
  outline: 2px solid rgba(255, 235, 59, 0.9);
}
`;

/**
 * Inject default highlight styles into the document.
 */
export function injectHighlightStyles(): void {
	const styleId = "gloss-highlight-styles";

	// Don't inject twice
	if (document.getElementById(styleId)) {
		return;
	}

	const style = document.createElement("style");
	style.id = styleId;
	style.textContent = HIGHLIGHT_STYLES;
	document.head.appendChild(style);
}
