import { describe, expect, it } from "bun:test";

import { mergeFeeds } from "./merge-feeds";

type Item = {
	_id: string;
	_creationTime: number;
	externalId?: string;
	source?: "gloss" | "curius";
};

describe("mergeFeeds", () => {
	it("returns an empty list when both inputs are empty", () => {
		expect(mergeFeeds<Item>([], [], 10)).toEqual([]);
		expect(mergeFeeds<Item>(undefined, undefined, 10)).toEqual([]);
	});

	it("shows bridge items when native is empty", () => {
		const bridge: Item[] = [
			{
				_id: "curius:1",
				_creationTime: 100,
				externalId: "1",
				source: "curius",
			},
			{ _id: "curius:2", _creationTime: 90, externalId: "2", source: "curius" },
		];
		expect(mergeFeeds<Item>([], bridge, 10)).toEqual(bridge);
	});

	it("shows native items when bridge is empty", () => {
		const native: Item[] = [
			{ _id: "native-a", _creationTime: 50 },
			{ _id: "native-b", _creationTime: 40 },
		];
		expect(mergeFeeds<Item>(native, [], 10)).toEqual(native);
	});

	it("drops bridge items whose externalId matches a native row (native wins)", () => {
		const native: Item[] = [
			{ _id: "native-1", _creationTime: 50, externalId: "shared" },
		];
		const bridge: Item[] = [
			{
				_id: "curius:shared",
				_creationTime: 200, // newer, but native must still win
				externalId: "shared",
				source: "curius",
			},
		];
		const merged = mergeFeeds<Item>(native, bridge, 10);
		expect(merged).toHaveLength(1);
		expect(merged[0]?._id).toBe("native-1");
	});

	it("interleaves by _creationTime descending", () => {
		const native: Item[] = [
			{ _id: "n-10", _creationTime: 10 },
			{ _id: "n-30", _creationTime: 30 },
		];
		const bridge: Item[] = [
			{ _id: "b-20", _creationTime: 20, source: "curius" },
			{ _id: "b-40", _creationTime: 40, source: "curius" },
		];
		const merged = mergeFeeds<Item>(native, bridge, 10);
		expect(merged.map((m) => m._id)).toEqual(["b-40", "n-30", "b-20", "n-10"]);
	});

	it("caps at limit, dropping the oldest entries", () => {
		const native: Item[] = [
			{ _id: "n-10", _creationTime: 10 },
			{ _id: "n-30", _creationTime: 30 },
		];
		const bridge: Item[] = [
			{ _id: "b-20", _creationTime: 20, source: "curius" },
			{ _id: "b-40", _creationTime: 40, source: "curius" },
		];
		const merged = mergeFeeds<Item>(native, bridge, 2);
		expect(merged.map((m) => m._id)).toEqual(["b-40", "n-30"]);
	});

	it("does not dedup across bridge items that share an externalId with nothing", () => {
		const bridge: Item[] = [
			{ _id: "b-1", _creationTime: 10, externalId: "x", source: "curius" },
			{ _id: "b-2", _creationTime: 20, externalId: "y", source: "curius" },
		];
		expect(mergeFeeds<Item>(undefined, bridge, 10)).toHaveLength(2);
	});
});
