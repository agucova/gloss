import { describe, expect, it } from "bun:test";

import {
	fuzzySearch,
	fuzzySearchWithContext,
	recommendedMaxErrors,
} from "../utils/fuzzy";

describe("fuzzySearch", () => {
	it("returns empty array for empty pattern", () => {
		expect(fuzzySearch("some text here", "", 3)).toEqual([]);
	});

	it("finds exact match with score 100", () => {
		const results = fuzzySearch("the quick brown fox", "brown", 2);
		expect(results.length).toBeGreaterThanOrEqual(1);
		const best = results[0]!;
		expect(best.errors).toBe(0);
		expect(best.score).toBe(100);
		expect("the quick brown fox".slice(best.start, best.end)).toBe("brown");
	});

	it("finds approximate match within error threshold", () => {
		const results = fuzzySearch("the quick brown fox", "brwn", 2);
		expect(results.length).toBeGreaterThanOrEqual(1);
		const best = results[0]!;
		expect(best.errors).toBeGreaterThan(0);
		expect(best.errors).toBeLessThanOrEqual(2);
		expect(best.score).toBeLessThan(100);
	});

	it("returns empty when errors exceed threshold", () => {
		// "xyz" is very different from anything in the text
		const results = fuzzySearch("the quick brown fox", "xyz", 0);
		expect(results).toEqual([]);
	});

	it("sorts results by score (best first)", () => {
		// Text with two similar words: "cat" and "car"
		const results = fuzzySearch("the cat sat on the car mat", "cat", 1);
		for (let i = 1; i < results.length; i++) {
			expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
		}
	});

	it("normalizes whitespace before matching", () => {
		const results = fuzzySearch("hello\n\t  world", "hello world", 0);
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results[0]!.errors).toBe(0);
	});
});

describe("fuzzySearchWithContext", () => {
	it("returns single match directly", () => {
		const result = fuzzySearchWithContext(
			"the quick brown fox jumps over the lazy dog",
			"brown fox",
			"",
			"",
			2
		);
		expect(result).not.toBeNull();
		expect(result!.errors).toBe(0);
	});

	it("returns null when no match found", () => {
		const result = fuzzySearchWithContext(
			"the quick brown fox",
			"zzzzzzzzz",
			"",
			"",
			1
		);
		expect(result).toBeNull();
	});

	it("disambiguates repeated text using prefix context", () => {
		const text =
			"The cat sat on the mat. The dog sat on the mat. The bird sat on the mat.";
		// All three "sat on the mat" are identical — prefix context should pick the right one
		const result = fuzzySearchWithContext(
			text,
			"sat on the mat",
			"The dog ",
			"",
			0
		);
		expect(result).not.toBeNull();
		// Should match the second occurrence (after "The dog ")
		const matched = text.slice(result!.start, result!.end);
		expect(matched).toBe("sat on the mat");
		// Verify it's the second occurrence by checking position
		const secondIndex = text.indexOf(
			"sat on the mat",
			text.indexOf("sat on the mat") + 1
		);
		expect(result!.start).toBe(secondIndex);
	});

	it("disambiguates repeated text using suffix context", () => {
		const text =
			"Read the book carefully. Read the book quickly. Read the book slowly.";
		const result = fuzzySearchWithContext(
			text,
			"Read the book",
			"",
			" quickly",
			0
		);
		expect(result).not.toBeNull();
		// Should match the second occurrence (before " quickly")
		const secondIndex = text.indexOf(
			"Read the book",
			text.indexOf("Read the book") + 1
		);
		expect(result!.start).toBe(secondIndex);
	});

	it("uses position hint as tie-breaker", () => {
		const text = "abc def abc def abc def";
		// Three occurrences of "abc def", position hint near the third
		const thirdIndex = text.lastIndexOf("abc def");
		const result = fuzzySearchWithContext(
			text,
			"abc def",
			"",
			"",
			0,
			thirdIndex
		);
		expect(result).not.toBeNull();
		// With no context but a position hint near the third occurrence,
		// it should prefer the closest match
		expect(result!.start).toBe(thirdIndex);
	});

	it("prefers context match over position hint", () => {
		const text = "First: hello world. Second: hello world. Third: hello world.";
		// Position hint near the third, but prefix context matches the first
		const thirdIndex = text.lastIndexOf("hello world");
		const result = fuzzySearchWithContext(
			text,
			"hello world",
			"First: ",
			"",
			0,
			thirdIndex
		);
		expect(result).not.toBeNull();
		// Context weight (20%) should dominate position hint (2%)
		const firstIndex = text.indexOf("hello world");
		expect(result!.start).toBe(firstIndex);
	});
});

describe("recommendedMaxErrors", () => {
	it("clamps short patterns to minimum of 2", () => {
		expect(recommendedMaxErrors(5)).toBe(2);
		expect(recommendedMaxErrors(10)).toBe(2);
		expect(recommendedMaxErrors(19)).toBe(2);
	});

	it("returns 10% of pattern length for medium patterns", () => {
		expect(recommendedMaxErrors(50)).toBe(5);
		expect(recommendedMaxErrors(100)).toBe(10);
	});

	it("clamps long patterns to maximum of 20", () => {
		expect(recommendedMaxErrors(300)).toBe(20);
		expect(recommendedMaxErrors(1000)).toBe(20);
	});

	it("handles boundary values", () => {
		// 20 chars -> ceil(2.0) = 2
		expect(recommendedMaxErrors(20)).toBe(2);
		// 200 chars -> ceil(20) = 20
		expect(recommendedMaxErrors(200)).toBe(20);
	});
});
