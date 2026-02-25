import { afterEach, describe, expect, it } from "bun:test";

import type { AnnotationSelector } from "../types";

import { anchor, anchorAll } from "../anchor";
import { describe as describeRange } from "../describe";
import { DescribeError } from "../types";

/**
 * Helper: set innerHTML on body and return body as root.
 */
function setDOM(html: string): Element {
	document.body.innerHTML = html;
	return document.body;
}

/**
 * Helper: create a Range selecting the text content of a text node.
 * Finds the first text node containing `text` under `root` and selects it.
 */
function selectText(root: Element, text: string): Range {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let node = walker.nextNode();
	while (node) {
		const content = node.textContent ?? "";
		const index = content.indexOf(text);
		if (index !== -1) {
			const range = document.createRange();
			range.setStart(node, index);
			range.setEnd(node, index + text.length);
			return range;
		}
		node = walker.nextNode();
	}
	throw new Error(`Text "${text}" not found in DOM`);
}

/**
 * Helper: create a Range that spans across multiple nodes.
 * Starts at `startText` in the first matching node and ends at `endText` in its node.
 */
function selectSpan(root: Element, startText: string, endText: string): Range {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let startNode: Node | null = null;
	let startOffset = 0;
	let endNode: Node | null = null;
	let endOffset = 0;

	let node = walker.nextNode();
	while (node) {
		const content = node.textContent ?? "";
		if (!startNode) {
			const idx = content.indexOf(startText);
			if (idx !== -1) {
				startNode = node;
				startOffset = idx;
			}
		}
		const endIdx = content.indexOf(endText);
		if (endIdx !== -1) {
			endNode = node;
			endOffset = endIdx + endText.length;
		}
		node = walker.nextNode();
	}

	if (!startNode || !endNode) {
		throw new Error(`Could not find span from "${startText}" to "${endText}"`);
	}

	const range = document.createRange();
	range.setStart(startNode, startOffset);
	range.setEnd(endNode, endOffset);
	return range;
}

afterEach(() => {
	document.body.innerHTML = "";
});

// ============================================================================
// Round-trip tests: describe -> anchor -> verify same text
// ============================================================================

describe("describe + anchor round-trip", () => {
	it("round-trips a simple paragraph selection", () => {
		const root = setDOM("<p>The quick brown fox jumps over the lazy dog.</p>");
		const range = selectText(root, "brown fox jumps");
		const selector = describeRange(range, { root });

		expect(selector.quote.exact).toBe("brown fox jumps");

		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		expect(result!.range.toString()).toBe("brown fox jumps");
		expect(result!.confidence).toBeGreaterThanOrEqual(0.95);
	});

	it("round-trips across nested markup", () => {
		const root = setDOM("<p>Hello <strong>bold world</strong> end!</p>");
		const range = selectSpan(root, "Hello", "end!");

		const selector = describeRange(range, { root });
		expect(selector.quote.exact).toContain("Hello");
		expect(selector.quote.exact).toContain("end!");

		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		expect(result!.range.toString()).toContain("Hello");
		expect(result!.range.toString()).toContain("end!");
	});

	it("round-trips across multiple paragraphs", () => {
		const root = setDOM(
			"<p>First paragraph content here.</p><p>Second paragraph content here.</p>"
		);
		const range = selectSpan(root, "content here", "Second paragraph");

		const selector = describeRange(range, { root });
		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		expect(result!.range.toString()).toContain("content here");
		expect(result!.range.toString()).toContain("Second paragraph");
	});

	it("round-trips with deeply nested elements", () => {
		const root = setDOM(
			"<div><section><article><p>Deep <em>nested <strong>text</strong> here</em> end</p></article></section></div>"
		);
		const range = selectSpan(root, "nested", "here");

		const selector = describeRange(range, { root });
		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		expect(result!.range.toString()).toBe("nested text here");
	});

	it("finds the correct occurrence of repeated text using context", () => {
		const root = setDOM(
			"<p>The cat sat on the mat.</p><p>The dog sat on the mat.</p><p>The bird sat on the mat.</p>"
		);
		// Select "sat on the mat" in the second paragraph
		const paragraphs = root.querySelectorAll("p");
		const secondP = paragraphs[1]!;
		const textNode = secondP.firstChild!;
		const text = textNode.textContent!;
		const offset = text.indexOf("sat on the mat");

		const range = document.createRange();
		range.setStart(textNode, offset);
		range.setEnd(textNode, offset + "sat on the mat".length);

		const selector = describeRange(range, { root });
		expect(selector.quote.prefix).toContain("dog");

		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		expect(result!.range.toString()).toBe("sat on the mat");
		// Verify it's in the second paragraph by checking the parent
		const anchoredNode = result!.range.startContainer;
		expect(anchoredNode.parentElement?.textContent).toContain("dog");
	});

	it("round-trips text with special characters", () => {
		const root = setDOM(
			'<p>Price is $100 &amp; tax (20%) = $120 &mdash; "final"</p>'
		);
		const range = selectText(root, "$100");

		const selector = describeRange(range, { root });
		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		expect(result!.range.toString()).toBe("$100");
	});
});

// ============================================================================
// Cascade fallback tests
// ============================================================================

describe("anchor cascade fallback", () => {
	it("anchors via position when DOM structure is preserved", () => {
		const root = setDOM("<p>Hello world, this is a test.</p>");
		const range = selectText(root, "world");
		const selector = describeRange(range, { root });

		// Anchor on the same, unmodified DOM
		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		expect(result!.range.toString()).toBe("world");
		// happy-dom doesn't support document.evaluate (XPath), so range method
		// won't work — it falls through to position or quote
		expect(["position", "quote"]).toContain(result!.method);
		expect(result!.confidence).toBeGreaterThanOrEqual(0.95);
	});

	it("falls back to quote when DOM is restructured but text preserved", () => {
		const root = setDOM("<p>Hello world, this is a test.</p>");
		const range = selectText(root, "this is a test");
		const selector = describeRange(range, { root });

		// Restructure: wrap in different elements, changing offsets
		root.innerHTML =
			"<div><span>Hello world, </span><em>this is a test.</em></div>";

		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		expect(result!.range.toString()).toBe("this is a test");
	});

	it("falls back to fuzzy when text is slightly changed", () => {
		const root = setDOM("<p>The quick brown fox jumps over the lazy dog.</p>");
		const range = selectText(root, "quick brown fox");
		const selector = describeRange(range, { root });

		// Alter the highlighted text slightly (one substitution: brown → brovn)
		root.innerHTML = "<p>The quick brovn fox jumps over the lazy dog.</p>";

		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		// Fuzzy match should find the altered text
		expect(result!.range.toString()).toContain("brovn fox");
		expect(result!.method).toBe("fuzzy");
		expect(result!.confidence).toBeLessThan(1.0);
		expect(result!.confidence).toBeGreaterThanOrEqual(0.5);
	});

	it("returns null when text is completely different", () => {
		const root = setDOM("<p>The quick brown fox jumps over the lazy dog.</p>");
		const range = selectText(root, "quick brown fox");
		const selector = describeRange(range, { root });

		// Completely replace the content
		root.innerHTML = "<p>Lorem ipsum dolor sit amet consectetur.</p>";

		const result = anchor(selector, { root });
		expect(result).toBeNull();
	});

	it("returns null for extra-long text when page has completely changed", () => {
		const root = setDOM(
			"<p>This is a really long paragraph with many specific words that would be very unlikely to appear elsewhere in any random text.</p>"
		);
		const range = selectText(root, "long paragraph with many specific words");
		const selector = describeRange(range, { root });

		root.innerHTML =
			"<p>Completely unrelated content about a different topic entirely.</p>";

		const result = anchor(selector, { root });
		expect(result).toBeNull();
	});
});

// ============================================================================
// describe() error handling
// ============================================================================

describe("describe error handling", () => {
	it("throws DescribeError on collapsed range", () => {
		const root = setDOM("<p>Hello world</p>");
		const range = document.createRange();
		const textNode = root.querySelector("p")!.firstChild!;
		range.setStart(textNode, 5);
		range.setEnd(textNode, 5); // collapsed

		expect(() => describeRange(range, { root })).toThrow(DescribeError);
	});

	it("throws DescribeError when range is outside root", () => {
		const root = setDOM("<div id='inside'>Inside</div>");
		const outsideDiv = document.createElement("div");
		outsideDiv.textContent = "Outside";
		document.body.appendChild(outsideDiv);

		const range = document.createRange();
		range.selectNodeContents(outsideDiv);

		// Use the inner div as root — range is outside it
		const innerRoot = root.querySelector("#inside")!;
		expect(() => describeRange(range, { root: innerRoot })).toThrow(
			DescribeError
		);
	});
});

// ============================================================================
// anchor() edge cases
// ============================================================================

describe("anchor edge cases", () => {
	it("returns null for a garbage selector", () => {
		const root = setDOM("<p>Hello world</p>");
		const garbageSelector: AnnotationSelector = {
			range: {
				type: "RangeSelector",
				startContainer: "/nonexistent/path[999]",
				startOffset: 0,
				endContainer: "/nonexistent/path[999]",
				endOffset: 10,
			},
			position: {
				type: "TextPositionSelector",
				start: 99999,
				end: 99999 + 10,
			},
			quote: {
				type: "TextQuoteSelector",
				exact: "xyzzy plugh abracadabra nonexistent text",
				prefix: "qqqqqqqqq",
				suffix: "zzzzzzzzz",
			},
		};

		const result = anchor(garbageSelector, { root });
		expect(result).toBeNull();
	});
});

// ============================================================================
// Context-aware fast path
// ============================================================================

describe("context-aware fast path", () => {
	it("rejects stale position when context does not align", () => {
		// Use long enough distinct prefixes so context clearly disambiguates
		const root = setDOM(
			"<p>Alpha bravo charlie delta echo foxtrot selected text here.</p>" +
				"<p>Golf hotel india juliet kilo lima selected text here.</p>"
		);

		// Select "selected text" in the second paragraph
		const secondP = root.querySelectorAll("p")[1]!;
		const textNode = secondP.firstChild!;
		const text = textNode.textContent!;
		const offset = text.indexOf("selected text");

		const range = document.createRange();
		range.setStart(textNode, offset);
		range.setEnd(textNode, offset + "selected text".length);

		const selector = describeRange(range, { root });
		// Prefix should contain words from the second paragraph
		expect(selector.quote.prefix).toContain("lima");

		// Swap paragraphs — position selector now points to the first paragraph
		root.innerHTML =
			"<p>Golf hotel india juliet kilo lima selected text here.</p>" +
			"<p>Alpha bravo charlie delta echo foxtrot selected text here.</p>";

		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		expect(result!.range.toString()).toBe("selected text");
		// Should find the correct occurrence (lima context) despite position shift
		const anchoredParent = result!.range.startContainer.parentElement;
		expect(anchoredParent?.textContent).toContain("lima");
	});

	it("gives confidence 1.0 when fast path text and context both match", () => {
		const root = setDOM("<p>The quick brown fox jumps over the lazy dog.</p>");
		const range = selectText(root, "brown fox");
		const selector = describeRange(range, { root });

		// Anchor on identical DOM
		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		expect(result!.confidence).toBe(1.0);
	});

	it("gives confidence 0.9 when selector has no stored context", () => {
		const root = setDOM("<p>Hello world</p>");
		const noContextSelector: AnnotationSelector = {
			range: {
				type: "RangeSelector",
				startContainer: "./text()",
				startOffset: 0,
				endContainer: "./text()",
				endOffset: 5,
			},
			position: {
				type: "TextPositionSelector",
				start: 0,
				end: 5,
			},
			quote: {
				type: "TextQuoteSelector",
				exact: "Hello",
				prefix: "",
				suffix: "",
			},
		};

		const result = anchor(noContextSelector, { root });
		expect(result).not.toBeNull();
		expect(result!.range.toString()).toBe("Hello");
		expect(result!.confidence).toBe(0.9);
	});
});

// ============================================================================
// anchorAll
// ============================================================================

describe("anchorAll", () => {
	it("processes multiple selectors with mixed success", () => {
		const root = setDOM(
			"<p>First sentence here.</p><p>Second sentence here.</p>"
		);

		// Create a valid selector
		const range1 = selectText(root, "First sentence");
		const validSelector = describeRange(range1, { root });

		// Create an invalid selector
		const invalidSelector: AnnotationSelector = {
			range: {
				type: "RangeSelector",
				startContainer: "/nope",
				startOffset: 0,
				endContainer: "/nope",
				endOffset: 5,
			},
			position: {
				type: "TextPositionSelector",
				start: 99999,
				end: 99999,
			},
			quote: {
				type: "TextQuoteSelector",
				exact: "nonexistent text that does not appear anywhere",
				prefix: "",
				suffix: "",
			},
		};

		const selectors = new Map<string, AnnotationSelector>([
			["valid", validSelector],
			["invalid", invalidSelector],
		]);

		const results = anchorAll(selectors, { root });
		expect(results.size).toBe(2);
		expect(results.get("valid")).not.toBeNull();
		expect(results.get("valid")!.range.toString()).toBe("First sentence");
		expect(results.get("invalid")).toBeNull();
	});

	it("accepts array of tuples", () => {
		const root = setDOM("<p>Hello world</p>");
		const range = selectText(root, "Hello");
		const selector = describeRange(range, { root });

		const results = anchorAll([["h1", selector]], { root });
		expect(results.size).toBe(1);
		expect(results.get("h1")).not.toBeNull();
	});
});

// ============================================================================
// Whitespace offset regression (navbar anchoring bug)
// ============================================================================

describe("whitespace offset mapping", () => {
	it("anchors to article body, not navbar, when HTML has heavy whitespace", () => {
		// Simulate a page with whitespace-heavy nav + article structure.
		// The quote text only appears in the article, but previously the
		// normalized→raw offset mismatch caused it to anchor in the nav.
		const root = setDOM(
			`<nav>
				<a>Cold\n\t\ttakes</a>
				<a>AI\n\t\thighlights</a>
				<a>About</a>
				<a>Most\n\t\tImportant\n\t\tCentury</a>
			</nav>
			<article>
				<p>This is an introduction to the most important century series.</p>
				<p>The 21st century could be the most important century ever for humanity, via the development of advanced AI systems.</p>
				<p>We need to take this more seriously as a civilization.</p>
			</article>`
		);

		// Selector with zeroed range/position (like seed data) — forces quote fallback
		const selector: AnnotationSelector = {
			range: {
				type: "RangeSelector",
				startContainer: "",
				startOffset: 0,
				endContainer: "",
				endOffset: 0,
			},
			position: {
				type: "TextPositionSelector",
				start: 0,
				end: 0,
			},
			quote: {
				type: "TextQuoteSelector",
				exact:
					"The 21st century could be the most important century ever for humanity, via the development of advanced AI systems.",
				prefix: "",
				suffix: "",
			},
		};

		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		expect(result!.range.toString()).toBe(
			"The 21st century could be the most important century ever for humanity, via the development of advanced AI systems."
		);

		// Verify the anchored range is in the article, not the nav
		const container = result!.range.startContainer;
		const parentEl =
			container.nodeType === Node.TEXT_NODE
				? container.parentElement
				: (container as Element);
		expect(parentEl?.closest("article")).not.toBeNull();
		expect(parentEl?.closest("nav")).toBeNull();
	});

	it("anchors correctly when only whitespace differs between nav and body text", () => {
		// "Most Important Century" appears in both nav and article,
		// but the full quote text is only in the article.
		const root = setDOM(
			`<nav>\n\t\t<a>Home</a>\n\t\t<a>Most Important Century</a>\n\t</nav>
			<main>
				<h1>Most Important Century</h1>
				<p>Something like PASTA is more likely than not this century.</p>
			</main>`
		);

		const selector: AnnotationSelector = {
			range: {
				type: "RangeSelector",
				startContainer: "",
				startOffset: 0,
				endContainer: "",
				endOffset: 0,
			},
			position: {
				type: "TextPositionSelector",
				start: 0,
				end: 0,
			},
			quote: {
				type: "TextQuoteSelector",
				exact: "Something like PASTA is more likely than not this century.",
				prefix: "",
				suffix: "",
			},
		};

		const result = anchor(selector, { root });
		expect(result).not.toBeNull();
		expect(result!.range.toString()).toBe(
			"Something like PASTA is more likely than not this century."
		);

		const container = result!.range.startContainer;
		const parentEl =
			container.nodeType === Node.TEXT_NODE
				? container.parentElement
				: (container as Element);
		expect(parentEl?.closest("main")).not.toBeNull();
		expect(parentEl?.closest("nav")).toBeNull();
	});
});
