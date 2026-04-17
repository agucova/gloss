import type { CuriusLink, CuriusUser } from "@gloss/curius";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { installBrowserStub } from "../test/setup";
import { chunk, collectMappings, linkToImportInput } from "./curius-import";

// =============================================================================
// Pure helpers (no mocking needed)
// =============================================================================

describe("collectMappings", () => {
	test("deduplicates when a follower id appears twice", () => {
		const following: CuriusUser[] = [
			{
				id: "alice",
				firstName: "Alice",
				lastName: "A",
				userLink: "alice-a",
			},
			{
				id: "alice",
				firstName: "Alice",
				lastName: "A",
				userLink: "alice-a",
			},
		];
		const links: CuriusLink[] = [];
		const result = collectMappings(following, links);
		expect(result).toHaveLength(1);
		expect(result[0]?.curiusUserId).toBe("alice");
	});

	test("preserves all fields from the following list", () => {
		const following: CuriusUser[] = [
			{
				id: "bob",
				firstName: "Bob",
				lastName: "Builder",
				userLink: "bob-builder",
			},
		];
		const result = collectMappings(following, []);
		expect(result[0]).toEqual({
			curiusUserId: "bob",
			curiusUsername: "bob-builder",
			firstName: "Bob",
			lastName: "Builder",
		});
	});
});

describe("linkToImportInput", () => {
	function makeLink(overrides: Partial<CuriusLink> = {}): CuriusLink {
		return {
			id: "link-1",
			link: "https://example.com/a",
			title: "A",
			highlights: [],
			nHighlights: 0,
			...overrides,
		} as CuriusLink;
	}

	test("prefers link.url over link.link when both are present", () => {
		const shaped = linkToImportInput(
			makeLink({
				url: "https://preferred.example.com",
				link: "https://fallback.example.com",
			})
		);
		expect(shaped?.url).toBe("https://preferred.example.com");
	});

	test("falls back to link.link when link.url is absent", () => {
		const shaped = linkToImportInput(
			makeLink({ url: undefined, link: "https://fallback.example.com" })
		);
		expect(shaped?.url).toBe("https://fallback.example.com");
	});

	test("returns null when neither url field is present", () => {
		// Forcing the invalid shape explicitly — the importer must tolerate
		// Curius having records with no URL (we've seen a handful).
		const shaped = linkToImportInput(
			makeLink({ url: undefined, link: undefined })
		);
		expect(shaped).toBeNull();
	});

	test("pulls highlight text from rawHighlight, highlightText, or highlight (in that order)", () => {
		const link = makeLink({
			highlights: [
				{
					id: "h-raw",
					linkId: "link-1",
					highlight: "ignored",
					highlightText: "ignored",
					rawHighlight: "winner",
				},
				{
					id: "h-text",
					linkId: "link-1",
					highlight: "ignored",
					highlightText: "winner",
				},
				{
					id: "h-highlight",
					linkId: "link-1",
					highlight: "winner",
				},
			] as unknown as CuriusLink["highlights"],
		});
		const shaped = linkToImportInput(link);
		expect(shaped?.highlights.map((h) => h.rawHighlight)).toEqual([
			"winner",
			"winner",
			"winner",
		]);
	});

	test("drops highlights with no usable text field", () => {
		const link = makeLink({
			highlights: [
				{
					id: "h-good",
					linkId: "link-1",
					highlight: "visible",
				},
				{
					id: "h-bad",
					linkId: "link-1",
					// no highlight/rawHighlight/highlightText set at all
				},
			] as unknown as CuriusLink["highlights"],
		});
		const shaped = linkToImportInput(link);
		expect(shaped?.highlights.map((h) => h.externalId)).toEqual(["h-good"]);
	});

	test("preserves empty-string contexts (common in Curius payloads)", () => {
		const link = makeLink({
			highlights: [
				{
					id: "h",
					linkId: "link-1",
					highlight: "text",
					rawHighlight: "text",
				},
			] as unknown as CuriusLink["highlights"],
		});
		const shaped = linkToImportInput(link);
		expect(shaped?.highlights[0]?.leftContext).toBe("");
		expect(shaped?.highlights[0]?.rightContext).toBe("");
	});
});

describe("chunk", () => {
	test("splits an array into batches of the given size, last batch shorter", () => {
		const items = Array.from({ length: 103 }, (_, i) => i);
		const batches = chunk(items, 50);
		expect(batches.map((b) => b.length)).toEqual([50, 50, 3]);
	});

	test("empty input → empty output", () => {
		expect(chunk([], 10)).toEqual([]);
	});
});

// =============================================================================
// runCuriusImport orchestration (mocked)
// =============================================================================

// Shared mutable mocks — re-wired per test via mock.module below.
const curiusMock = {
	getUserLinks: mock(async () => [] as CuriusLink[]),
	getFollowing: mock(async () => [] as CuriusUser[]),
};

mock.module("@gloss/curius", () => ({
	CuriusClient: class {
		getUserLinks = curiusMock.getUserLinks;
		getFollowing = curiusMock.getFollowing;
	},
	CuriusAuthError: class CuriusAuthError extends Error {
		constructor() {
			super("Authentication failed");
			this.name = "CuriusAuthError";
		}
	},
}));

// Must come after the mock.module call so the module loads with the mocked
// CuriusClient shape.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runCuriusImport } = await import("./curius-import");
// Convex's generated `api` is a proxy — property accesses don't produce a
// stable identity, so we identify mutations by the stable string returned
// from `getFunctionName`.
const { getFunctionName } = await import("convex/server");

function makeConvexClient() {
	const calls: Array<{ name: string; args: unknown }> = [];
	return {
		calls,
		mutation: mock(async (ref: unknown, args: unknown) => {
			const name = getFunctionName(
				ref as Parameters<typeof getFunctionName>[0]
			);
			calls.push({ name, args });
			// importChunk's handler reads `.highlightsInserted` off the result,
			// so return a realistic shape. Other mutations return void.
			if (name === "curius:importChunk") {
				return { highlightsInserted: 0, bookmarksInserted: 0 };
			}
			return undefined;
		}),
	};
}

describe("runCuriusImport", () => {
	beforeEach(() => {
		installBrowserStub();
		curiusMock.getUserLinks.mockReset();
		curiusMock.getFollowing.mockReset();
	});

	afterEach(() => {
		curiusMock.getUserLinks.mockReset();
		curiusMock.getFollowing.mockReset();
	});

	test("happy path: startImport → upsertMappings → importChunk* → finishImport (in that order)", async () => {
		curiusMock.getFollowing.mockResolvedValueOnce([
			{
				id: "alice",
				firstName: "Alice",
				lastName: "A",
				userLink: "alice",
			},
		]);
		curiusMock.getUserLinks.mockResolvedValueOnce([
			{
				id: "1",
				link: "https://example.com/a",
				title: "A",
				highlights: [
					{
						id: "h1",
						linkId: "1",
						highlight: "quote one",
						rawHighlight: "quote one",
					},
				],
				nHighlights: 1,
			},
			{
				id: "2",
				link: "https://example.com/b",
				title: "B",
				highlights: [],
				nHighlights: 0,
			},
		] as unknown as CuriusLink[]);

		const convexClient = makeConvexClient();
		await runCuriusImport({
			// biome-ignore lint/suspicious/noExplicitAny: we only need a minimal surface
			convexClient: convexClient as any,
			token: "fake-jwt",
		});

		// The sequence must start with startImport, end with finishImport,
		// and contain upsertMappings + at least one importChunk in between.
		const names = convexClient.calls.map((c) => c.name);
		expect(names[0]).toBe("curius:startImport");
		expect(names[names.length - 1]).toBe("curius:finishImport");
		expect(names).toContain("curius:upsertMappings");
		expect(names).toContain("curius:importChunk");
		expect(names).toContain("curius:updateImportProgress");
		// failImport must not have been called on a happy run.
		expect(names).not.toContain("curius:failImport");
	});

	test("on CuriusAuthError: token cleared, failImport called with 'token_expired', error rethrown", async () => {
		const env = installBrowserStub();
		await env.sync.set({ "curius.token": "will-be-cleared" });

		// Simulate auth error mid-fetch.
		const { CuriusAuthError } = await import("@gloss/curius");
		curiusMock.getUserLinks.mockRejectedValueOnce(new CuriusAuthError());

		const convexClient = makeConvexClient();
		await expect(
			runCuriusImport({
				// biome-ignore lint/suspicious/noExplicitAny: minimal surface
				convexClient: convexClient as any,
				token: "fake-jwt",
			})
		).rejects.toThrow(/Authentication failed/);

		// Token is cleared from sync storage.
		const { "curius.token": tokenAfter } = await env.sync.get("curius.token");
		expect(tokenAfter).toBeUndefined();

		// failImport was called with token_expired.
		const failCall = convexClient.calls.find(
			(c) => c.name === "curius:failImport"
		);
		expect(failCall).toBeDefined();
		expect(failCall?.args).toEqual({ error: "token_expired" });

		// finishImport was NOT called.
		expect(
			convexClient.calls.some((c) => c.name === "curius:finishImport")
		).toBe(false);
	});
});
