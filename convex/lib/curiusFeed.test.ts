import { describe, expect, it } from "vitest";

import type { LibraryResponse } from "./curiusFeed";

import {
	collectAuthorCuriusIds,
	type FeedMapping,
	shapeFeedFromLibrary,
} from "./curiusFeed";

function makeLibrary(
	entries: Array<Partial<LibraryResponse["library"][number]>>
): LibraryResponse {
	return {
		library: entries.map((e, i) => ({
			id: String(e.id ?? `link-${i}`),
			link: e.link ?? "https://example.com",
			title: e.title ?? null,
			snippet: null,
			metadata: null,
			favorite: null,
			createdDate: null,
			modifiedDate: e.modifiedDate ?? null,
			lastCrawled: null,
			userIds: e.userIds ?? [],
			users: e.users ?? [],
			highlights: e.highlights ?? [],
			comments: [],
			readCount: 0,
		})) as LibraryResponse["library"],
	};
}

function fixedNow(ms: number): () => number {
	return () => ms;
}

describe("collectAuthorCuriusIds", () => {
	it("gathers highlight authors (highlights kind) unique", () => {
		const library = makeLibrary([
			{
				highlights: [
					{
						id: "h1",
						userId: "alice",
						linkId: "1",
						highlight: "a",
					},
					{
						id: "h2",
						userId: "bob",
						linkId: "1",
						highlight: "b",
					},
					{
						id: "h3",
						userId: "alice",
						linkId: "1",
						highlight: "c",
					},
				],
			},
		]);
		expect(collectAuthorCuriusIds(library, "highlights").sort()).toEqual([
			"alice",
			"bob",
		]);
	});

	it("gathers entry.users ids (bookmarks kind) not highlight authors", () => {
		const library = makeLibrary([
			{
				users: [
					{ id: "claire", firstName: "Claire", lastName: "W", userLink: "cw" },
				],
				highlights: [
					{
						id: "h1",
						userId: "not-in-users",
						linkId: "1",
						highlight: "a",
					},
				],
			},
		]);
		expect(collectAuthorCuriusIds(library, "bookmarks")).toEqual(["claire"]);
	});
});

describe("shapeFeedFromLibrary — highlights kind", () => {
	it("emits one item per highlight inside each library entry", () => {
		const library = makeLibrary([
			{
				link: "https://example.com/a",
				modifiedDate: "2026-04-18T00:00:00Z",
				users: [
					{ id: "alice", firstName: "Alice", lastName: "A", userLink: "alice" },
				],
				highlights: [
					{
						id: "h1",
						userId: "alice",
						linkId: "1",
						highlight: "quote one",
						rawHighlight: "quote one",
						createdDate: "2026-04-18T01:00:00Z",
					},
					{
						id: "h2",
						userId: "alice",
						linkId: "1",
						highlight: "quote two",
						rawHighlight: "quote two",
						createdDate: "2026-04-18T02:00:00Z",
					},
				],
			},
		]);
		const items = shapeFeedFromLibrary(library, "highlights", {}, 10);
		expect(items).toHaveLength(2);
		expect(items.map((i) => i._id).sort()).toEqual(["curius:h1", "curius:h2"]);
		expect(items.every((i) => i.url === "https://example.com/a")).toBe(true);
	});

	it("drops highlights with no usable text", () => {
		const library = makeLibrary([
			{
				highlights: [
					{
						id: "h-good",
						userId: "alice",
						linkId: "1",
						highlight: "visible",
					},
					{
						id: "h-bad",
						userId: "alice",
						linkId: "1",
						// no highlight/rawHighlight/highlightText
						highlight: "",
					},
				],
			},
		]);
		const items = shapeFeedFromLibrary(library, "highlights", {}, 10);
		expect(items.map((i) => i.externalId)).toEqual(["h-good"]);
	});

	it("uses hl.createdDate for _creationTime when present, else entry.modifiedDate", () => {
		const library = makeLibrary([
			{
				modifiedDate: "2026-04-18T00:00:00Z",
				highlights: [
					{
						id: "with-date",
						userId: "alice",
						linkId: "1",
						highlight: "a",
						createdDate: "2026-04-18T05:00:00Z",
					},
					{
						id: "without-date",
						userId: "alice",
						linkId: "1",
						highlight: "b",
					},
				],
			},
		]);
		const items = shapeFeedFromLibrary(library, "highlights", {}, 10);
		const byId = Object.fromEntries(items.map((i) => [i.externalId, i]));
		expect(byId["with-date"]?._creationTime).toBe(
			Date.parse("2026-04-18T05:00:00Z")
		);
		expect(byId["without-date"]?._creationTime).toBe(
			Date.parse("2026-04-18T00:00:00Z")
		);
	});

	it("falls back to now() on unparseable dates (not NaN)", () => {
		const library = makeLibrary([
			{
				modifiedDate: "not-a-date",
				highlights: [
					{
						id: "h",
						userId: "alice",
						linkId: "1",
						highlight: "a",
						createdDate: "also-not-a-date",
					},
				],
			},
		]);
		const items = shapeFeedFromLibrary(
			library,
			"highlights",
			{},
			10,
			fixedNow(42)
		);
		expect(items[0]?._creationTime).toBe(42);
		expect(Number.isFinite(items[0]?._creationTime)).toBe(true);
	});

	it("hydrates author via mapping: migrated friend gets glossUserId, else synthetic id", () => {
		const library = makeLibrary([
			{
				highlights: [
					{
						id: "h1",
						userId: "alice",
						linkId: "1",
						highlight: "a",
					},
					{
						id: "h2",
						userId: "bob",
						linkId: "1",
						highlight: "b",
					},
				],
			},
		]);
		const mappings: Record<string, FeedMapping> = {
			alice: {
				glossUserId: "gloss-user-123",
				firstName: "Alice",
				lastName: "Adams",
				curiusUsername: "alice-adams",
			},
			// bob has no mapping at all
		};
		const items = shapeFeedFromLibrary(library, "highlights", mappings, 10);
		const byId = Object.fromEntries(items.map((i) => [i.externalId, i]));
		expect(byId["h1"]?.user._id).toBe("gloss-user-123");
		expect(byId["h1"]?.user.name).toBe("Alice Adams");
		expect(byId["h2"]?.user._id).toBe("curius:bob");
		expect(byId["h2"]?.user.name).toBe("Someone");
	});

	it("display-name fallback chain: mapping > inline user > userLink > 'Someone'", () => {
		const library = makeLibrary([
			{
				highlights: [
					{
						id: "inline",
						userId: "u1",
						linkId: "1",
						highlight: "a",
						user: {
							id: "u1",
							firstName: "Inline",
							lastName: "Name",
							userLink: "inline-name",
						},
					},
					{
						id: "link-only",
						userId: "u2",
						linkId: "1",
						highlight: "b",
						user: {
							id: "u2",
							firstName: "",
							lastName: "",
							userLink: "somebody",
						},
					},
					{
						id: "empty",
						userId: "u3",
						linkId: "1",
						highlight: "c",
					},
				],
			},
		]);
		const mappings: Record<string, FeedMapping> = {
			u1: {
				glossUserId: undefined,
				firstName: "Mapped",
				lastName: "Wins",
				curiusUsername: "mapped",
			},
		};
		const items = shapeFeedFromLibrary(library, "highlights", mappings, 10);
		const byId = Object.fromEntries(items.map((i) => [i.externalId, i]));
		expect(byId["inline"]?.user.name).toBe("Mapped Wins");
		expect(byId["link-only"]?.user.name).toBe("somebody");
		expect(byId["empty"]?.user.name).toBe("Someone");
	});

	it("sorts descending by _creationTime and caps at limit", () => {
		const library = makeLibrary([
			{
				highlights: [
					{
						id: "old",
						userId: "a",
						linkId: "1",
						highlight: "x",
						createdDate: "2020-01-01T00:00:00Z",
					},
					{
						id: "newest",
						userId: "a",
						linkId: "1",
						highlight: "y",
						createdDate: "2030-01-01T00:00:00Z",
					},
					{
						id: "mid",
						userId: "a",
						linkId: "1",
						highlight: "z",
						createdDate: "2025-01-01T00:00:00Z",
					},
				],
			},
		]);
		const items = shapeFeedFromLibrary(library, "highlights", {}, 2);
		expect(items.map((i) => i.externalId)).toEqual(["newest", "mid"]);
	});
});

describe("shapeFeedFromLibrary — bookmarks kind", () => {
	it("emits one item per entry, attributed to users[0]", () => {
		const library = makeLibrary([
			{
				id: "link-1",
				link: "https://example.com/a",
				title: "A",
				modifiedDate: "2026-04-18T00:00:00Z",
				users: [
					{
						id: "primary",
						firstName: "Primary",
						lastName: "User",
						userLink: "primary",
					},
					{
						id: "secondary",
						firstName: "Secondary",
						lastName: "User",
						userLink: "secondary",
					},
				],
				highlights: [
					{
						id: "h-irrelevant",
						userId: "primary",
						linkId: "link-1",
						highlight: "also saved",
					},
				],
			},
		]);
		const items = shapeFeedFromLibrary(library, "bookmarks", {}, 10);
		expect(items).toHaveLength(1);
		expect(items[0]?.externalId).toBe("link-1");
		expect(items[0]?.title).toBe("A");
		expect(items[0]?.user.name).toBe("Primary User");
		expect(items[0]?._id).toBe("curius:link-1");
	});

	it("skips entries with empty users array (no primary)", () => {
		const library = makeLibrary([
			{ id: "no-user", users: [] },
			{
				id: "has-user",
				users: [{ id: "a", firstName: "A", lastName: "Z", userLink: "a" }],
			},
		]);
		const items = shapeFeedFromLibrary(library, "bookmarks", {}, 10);
		expect(items.map((i) => i.externalId)).toEqual(["has-user"]);
	});
});
