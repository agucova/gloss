import { afterEach, describe, expect, it } from "bun:test";

import type { Highlight } from "../types";

import { HighlightManager } from "../manager";
import { fromCuriusPosition } from "../types";

function setDOM(html: string): Element {
	document.body.innerHTML = html;
	return document.body;
}

function makeHighlight(id: string, text: string): Highlight {
	return {
		id,
		selector: {
			quote: fromCuriusPosition({
				rawHighlight: text,
				leftContext: "",
				rightContext: "",
			}),
		},
	};
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("HighlightManager.add — idempotency", () => {
	it("replacing a highlight with the same ID leaves exactly one overlay", () => {
		const root = setDOM("<p>Repeating the same highlight twice in a row.</p>");
		const manager = new HighlightManager({ root });

		const h = makeHighlight("dup-1", "same highlight");

		const first = manager.add(h);
		expect(first).not.toBeNull();
		expect(document.querySelectorAll("mark").length).toBe(1);

		const second = manager.add(h);
		expect(second).not.toBeNull();
		// The old <mark> must have been cleaned up before the new one was installed.
		expect(document.querySelectorAll("mark").length).toBe(1);
	});

	it("replacing with a different selector for the same ID updates the DOM", () => {
		const root = setDOM(
			"<p>The first target phrase and also the second target phrase.</p>"
		);
		const manager = new HighlightManager({ root });

		const first = makeHighlight("same-id", "first target");
		const second = makeHighlight("same-id", "second target");

		manager.add(first);
		expect(document.querySelectorAll("mark")[0]?.textContent).toBe(
			"first target"
		);

		manager.add(second);
		const marks = document.querySelectorAll("mark");
		expect(marks.length).toBe(1);
		expect(marks[0]?.textContent).toBe("second target");
	});

	it("two different IDs both render without interfering", () => {
		const root = setDOM("<p>Alpha content then Beta content.</p>");
		const manager = new HighlightManager({ root });

		manager.add(makeHighlight("a", "Alpha"));
		manager.add(makeHighlight("b", "Beta"));

		expect(document.querySelectorAll("mark").length).toBe(2);
	});
});
