/**
 * XPath utilities for generating and evaluating XPath expressions.
 * Used by RangeSelector for precise DOM node references.
 */

/**
 * Get the local name for a node, handling text nodes specially.
 */
function getNodeName(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return "text()";
	}
	if (node.nodeType === Node.ELEMENT_NODE) {
		return (node as Element).localName.toLowerCase();
	}
	if (node.nodeType === Node.COMMENT_NODE) {
		return "comment()";
	}
	if (node.nodeType === Node.CDATA_SECTION_NODE) {
		return "cdata()";
	}
	return "node()";
}

/**
 * Get the 1-based position of a node among its siblings of the same type.
 */
function getNodePosition(node: Node): number {
	const name = getNodeName(node);
	let position = 1;
	let sibling = node.previousSibling;

	while (sibling) {
		if (getNodeName(sibling) === name) {
			position++;
		}
		sibling = sibling.previousSibling;
	}

	return position;
}

/**
 * Count how many siblings of the same type a node has.
 */
function countSameTypeSiblings(node: Node): number {
	const name = getNodeName(node);
	let count = 0;
	const parent = node.parentNode;

	if (!parent) return 1;

	let sibling = parent.firstChild;
	while (sibling) {
		if (getNodeName(sibling) === name) {
			count++;
		}
		sibling = sibling.nextSibling;
	}

	return count;
}

/**
 * Generate an XPath expression from a node to a root element.
 * The XPath is relative to the root, not the document.
 *
 * @example
 * // Returns "/div[1]/p[2]/text()[1]"
 * xpathFromNode(textNode, containerDiv)
 */
export function xpathFromNode(
	node: Node,
	root: Element = document.body
): string {
	const parts: string[] = [];
	let current: Node | null = node;

	while (current && current !== root && current !== document) {
		const name = getNodeName(current);
		const position = getNodePosition(current);
		const siblingCount = countSameTypeSiblings(current);

		// Only add index if there are multiple siblings of same type
		if (siblingCount > 1) {
			parts.unshift(`${name}[${position}]`);
		} else {
			parts.unshift(name);
		}

		current = current.parentNode;
	}

	if (parts.length === 0) {
		return ".";
	}

	return "./" + parts.join("/");
}

/**
 * Evaluate an XPath expression relative to a root element.
 * Returns the first matching node or null.
 *
 * @example
 * const node = nodeFromXPath("./div[1]/p[2]/text()[1]", containerDiv)
 */
export function nodeFromXPath(
	xpath: string,
	root: Element = document.body
): Node | null {
	// Handle empty or self-reference
	if (!xpath || xpath === "." || xpath === "./") {
		return root;
	}

	try {
		const result = document.evaluate(
			xpath,
			root,
			null,
			XPathResult.FIRST_ORDERED_NODE_TYPE,
			null
		);
		return result.singleNodeValue;
	} catch {
		// XPath evaluation can throw for invalid expressions
		return null;
	}
}

/**
 * Check if a node is a descendant of another node.
 */
export function isDescendantOf(node: Node, ancestor: Node): boolean {
	let current: Node | null = node;
	while (current) {
		if (current === ancestor) {
			return true;
		}
		current = current.parentNode;
	}
	return false;
}

/**
 * Get the common ancestor of two nodes.
 */
export function getCommonAncestor(nodeA: Node, nodeB: Node): Node | null {
	const ancestorsA = new Set<Node>();
	let current: Node | null = nodeA;

	while (current) {
		ancestorsA.add(current);
		current = current.parentNode;
	}

	current = nodeB;
	while (current) {
		if (ancestorsA.has(current)) {
			return current;
		}
		current = current.parentNode;
	}

	return null;
}
