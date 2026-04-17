import type { NetworkInfo } from "@gloss/curius";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { installBrowserStub } from "../test/setup";

// ---------------------------------------------------------------------------
// Shared mocks for @gloss/curius + ./api. The bridge instantiates the client
// fresh each call, so a class that delegates to a module-level spy set is the
// simplest shape to control per-test.
// ---------------------------------------------------------------------------

const curiusMock = {
	getNetworkInfo: mock(async (_url: string) => null as NetworkInfo | null),
	getFollowing: mock(async () => [] as unknown[]),
};

const convexQueryCalls: Array<{ name: string; args: unknown }> = [];
const convexQueryResponse = { value: {} as Record<string, unknown> };

mock.module("@gloss/curius", () => ({
	CuriusClient: class {
		getNetworkInfo = curiusMock.getNetworkInfo;
		getFollowing = curiusMock.getFollowing;
	},
	CuriusAuthError: class CuriusAuthError extends Error {
		constructor() {
			super("Authentication failed");
			this.name = "CuriusAuthError";
		}
	},
}));

mock.module("./api", () => ({
	api: {
		curius: {
			// Opaque refs — they get passed into the mocked client.query below.
			getMappingsByCuriusIds: Symbol("getMappingsByCuriusIds"),
		},
	},
	getConvexClient: () => ({
		query: async (ref: unknown, args: unknown) => {
			const name =
				typeof ref === "symbol" ? (ref.description ?? "?") : String(ref);
			convexQueryCalls.push({ name, args });
			return convexQueryResponse.value;
		},
	}),
}));

// Must come after mock.module calls so the module under test loads against
// the mocks.
const {
	handleLoadCuriusBridge,
	setToken,
	clearToken,
	invalidateSocialCaches,
	_resetRateLimiterForTests,
} = await import("./curius-bridge");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNetworkInfo(
	highlights: Array<
		Array<{
			id: string;
			userId: string;
			highlight: string;
			rawHighlight?: string;
			leftContext?: string;
			rightContext?: string;
			user?: { firstName: string; lastName: string; userLink: string };
		}>
	>
): NetworkInfo {
	// Shape-compatible stand-in. The bridge only reads `.highlights`.
	return {
		id: "1",
		link: "https://example.com/page",
		users: [],
		highlights,
		// biome-ignore lint/suspicious/noExplicitAny: tests don't need the full shape
	} as any;
}

describe("curius-bridge", () => {
	beforeEach(async () => {
		installBrowserStub();
		_resetRateLimiterForTests();
		curiusMock.getNetworkInfo.mockReset();
		curiusMock.getFollowing.mockReset();
		convexQueryCalls.length = 0;
		convexQueryResponse.value = {};
	});

	afterEach(() => {
		curiusMock.getNetworkInfo.mockReset();
		curiusMock.getFollowing.mockReset();
	});

	// ------------------------------------------------------------------------
	// Fast path: non-connected user pays zero cost
	// ------------------------------------------------------------------------

	test("no cached token → returns empty without calling Curius or Convex", async () => {
		const result = await handleLoadCuriusBridge("https://example.com/a");
		expect(result.highlights).toEqual([]);
		expect(curiusMock.getNetworkInfo).toHaveBeenCalledTimes(0);
		expect(curiusMock.getFollowing).toHaveBeenCalledTimes(0);
		expect(convexQueryCalls).toHaveLength(0);
	});

	// ------------------------------------------------------------------------
	// URL cache
	// ------------------------------------------------------------------------

	test("same URL twice in a row: Curius is hit once, second call serves from cache", async () => {
		await setToken("fake-jwt");
		curiusMock.getFollowing.mockResolvedValue([
			{ id: "alice", firstName: "Alice", lastName: "A", userLink: "alice" },
		]);
		curiusMock.getNetworkInfo.mockResolvedValue(
			makeNetworkInfo([
				[
					{
						id: "h1",
						userId: "alice",
						highlight: "a",
						rawHighlight: "a",
					},
				],
			])
		);

		const first = await handleLoadCuriusBridge("https://example.com/a");
		const second = await handleLoadCuriusBridge("https://example.com/a");

		expect(first.highlights).toHaveLength(1);
		expect(second.highlights).toEqual(first.highlights);
		expect(curiusMock.getNetworkInfo).toHaveBeenCalledTimes(1);
	});

	test("getNetworkInfo returning null is cached as empty (no repeated hits)", async () => {
		await setToken("fake-jwt");
		curiusMock.getFollowing.mockResolvedValue([]);
		curiusMock.getNetworkInfo.mockResolvedValue(null);

		await handleLoadCuriusBridge("https://example.com/empty");
		await handleLoadCuriusBridge("https://example.com/empty");
		expect(curiusMock.getNetworkInfo).toHaveBeenCalledTimes(1);
	});

	// ------------------------------------------------------------------------
	// Rate limiter
	// ------------------------------------------------------------------------

	test("token bucket: 10 rapid calls all fetch; 11th short-circuits to empty", async () => {
		await setToken("fake-jwt");
		curiusMock.getFollowing.mockResolvedValue([]);
		curiusMock.getNetworkInfo.mockResolvedValue(null);

		// 10 distinct URLs so the per-URL cache doesn't mask the rate limiter.
		for (let i = 0; i < 10; i++) {
			await handleLoadCuriusBridge(`https://example.com/${i}`);
		}
		expect(curiusMock.getNetworkInfo).toHaveBeenCalledTimes(10);

		const eleventh = await handleLoadCuriusBridge("https://example.com/11");
		expect(eleventh.highlights).toEqual([]);
		// The 11th call must not have reached Curius (bucket empty).
		expect(curiusMock.getNetworkInfo).toHaveBeenCalledTimes(10);
	});

	// ------------------------------------------------------------------------
	// Following filter + shape
	// ------------------------------------------------------------------------

	test("filters to authors the user follows; drops non-followed", async () => {
		await setToken("fake-jwt");
		curiusMock.getFollowing.mockResolvedValue([
			{ id: "alice", firstName: "Alice", lastName: "A", userLink: "alice" },
		]);
		// Seed the mapping response so hydrate fills in Alice's name. Without
		// either a mapping OR an inline `user` on the highlight, the bridge
		// falls back to "Unknown" — which is intended behaviour.
		convexQueryResponse.value = {
			alice: {
				glossUserId: undefined,
				firstName: "Alice",
				lastName: "A",
				curiusUsername: "alice",
			},
		};
		curiusMock.getNetworkInfo.mockResolvedValue(
			makeNetworkInfo([
				[
					{
						id: "h1",
						userId: "alice",
						highlight: "followed",
						rawHighlight: "followed",
					},
					{
						id: "h2",
						userId: "stranger",
						highlight: "not followed",
						rawHighlight: "not followed",
					},
				],
			])
		);

		const result = await handleLoadCuriusBridge("https://example.com/filter");
		expect(result.highlights.map((h) => h.externalId)).toEqual(["h1"]);
		expect(result.highlights[0]?.user.firstName).toBe("Alice");
	});

	test("hydrates glossUserId from the Convex mapping query", async () => {
		await setToken("fake-jwt");
		curiusMock.getFollowing.mockResolvedValue([
			{ id: "alice", firstName: "Alice", lastName: "A", userLink: "alice" },
		]);
		curiusMock.getNetworkInfo.mockResolvedValue(
			makeNetworkInfo([
				[
					{
						id: "h1",
						userId: "alice",
						highlight: "a",
						rawHighlight: "a",
					},
				],
			])
		);
		convexQueryResponse.value = {
			alice: {
				glossUserId: "gloss-user-123",
				firstName: "Alice",
				lastName: "Adams",
				curiusUsername: "alice",
			},
		};

		const result = await handleLoadCuriusBridge("https://example.com/map");
		expect(result.highlights[0]?.user.glossUserId).toBe("gloss-user-123");
		// Prefers the mapping's name over the inline one.
		expect(result.highlights[0]?.user.lastName).toBe("Adams");
	});

	// ------------------------------------------------------------------------
	// Following cache: only one getFollowing call across multiple URL loads
	// ------------------------------------------------------------------------

	test("following list cached across URL loads within its TTL", async () => {
		await setToken("fake-jwt");
		curiusMock.getFollowing.mockResolvedValue([
			{ id: "alice", firstName: "Alice", lastName: "A", userLink: "alice" },
		]);
		// The bridge only calls getFollowing when getNetworkInfo returns
		// non-null info, so each test URL must have a payload.
		curiusMock.getNetworkInfo.mockResolvedValue(
			makeNetworkInfo([
				[
					{
						id: "h",
						userId: "alice",
						highlight: "x",
						rawHighlight: "x",
					},
				],
			])
		);

		await handleLoadCuriusBridge("https://example.com/a");
		await handleLoadCuriusBridge("https://example.com/b");
		await handleLoadCuriusBridge("https://example.com/c");

		expect(curiusMock.getFollowing).toHaveBeenCalledTimes(1);
	});

	// ------------------------------------------------------------------------
	// Auth error → token + caches cleared
	// ------------------------------------------------------------------------

	test("CuriusAuthError clears the cached JWT; a subsequent call is on the fast path", async () => {
		const env = installBrowserStub();
		_resetRateLimiterForTests();
		await setToken("expired-jwt");
		const { CuriusAuthError } = await import("@gloss/curius");
		curiusMock.getFollowing.mockResolvedValue([]);
		curiusMock.getNetworkInfo.mockRejectedValueOnce(new CuriusAuthError());

		const result = await handleLoadCuriusBridge("https://example.com/x");
		expect(result.highlights).toEqual([]);

		// Token gone.
		const { "curius.token": tokenAfter } = await env.sync.get("curius.token");
		expect(tokenAfter).toBeUndefined();

		// Next call is zero-cost.
		const second = await handleLoadCuriusBridge("https://example.com/y");
		expect(second.highlights).toEqual([]);
		// Only the first call reached getNetworkInfo.
		expect(curiusMock.getNetworkInfo).toHaveBeenCalledTimes(1);
	});

	// ------------------------------------------------------------------------
	// Social cache invalidation preserves token
	// ------------------------------------------------------------------------

	test("invalidateSocialCaches clears following + url + mapping caches but keeps the JWT", async () => {
		const env = installBrowserStub();
		_resetRateLimiterForTests();
		await setToken("keep-me");
		// Warm each cache by writing directly through the public surface where
		// we can, then asserting they exist in storage.
		await env.local.set({
			"curius.followingCache": { fetchedAt: Date.now(), userIds: ["x"] },
			"curius.urlCache": { someHash: { fetchedAt: Date.now(), payload: [] } },
			"curius.mappingCache": {
				alice: {
					fetchedAt: Date.now(),
					glossUserId: undefined,
					firstName: "Alice",
					lastName: "A",
					curiusUsername: "alice",
				},
			},
		});

		await invalidateSocialCaches();

		const localAfter = await env.local.get([
			"curius.followingCache",
			"curius.urlCache",
			"curius.mappingCache",
		]);
		expect(localAfter).toEqual({});

		// Token is untouched — we still consider the user connected.
		const { "curius.token": tokenAfter } = await env.sync.get("curius.token");
		expect(tokenAfter).toBe("keep-me");
	});

	test("clearToken wipes the JWT AND all social caches", async () => {
		const env = installBrowserStub();
		_resetRateLimiterForTests();
		await setToken("jwt");
		await env.local.set({
			"curius.urlCache": { h: { fetchedAt: 0, payload: [] } },
		});

		await clearToken();

		const { "curius.token": tokenAfter } = await env.sync.get("curius.token");
		const { "curius.urlCache": urlAfter } =
			await env.local.get("curius.urlCache");
		expect(tokenAfter).toBeUndefined();
		expect(urlAfter).toBeUndefined();
	});
});
