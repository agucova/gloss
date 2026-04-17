import type { libraryResponseSchema } from "@gloss/curius";
import type { z } from "zod";

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.test).*s");

// =============================================================================
// Mock @gloss/curius so getFriendFeed never touches the network. `getLibrary`
// is the only method we need to control; tests seed its return value before
// calling the action.
// =============================================================================

const getLibraryMock = vi.fn<
	[],
	Promise<z.infer<typeof libraryResponseSchema>>
>();

vi.mock("@gloss/curius", async () => {
	const actual =
		await vi.importActual<typeof import("@gloss/curius")>("@gloss/curius");
	class MockCuriusClient {
		getLibrary = getLibraryMock;
	}
	return {
		...actual,
		CuriusClient: MockCuriusClient,
	};
});

// =============================================================================
// Helpers
// =============================================================================

async function seedUserWithCreds(t: ReturnType<typeof convexTest>) {
	const authId = "feed-user";
	const userId = await t.run(async (ctx) =>
		ctx.db.insert("users", {
			authId,
			name: "Feed User",
			email: `${authId}@example.com`,
			emailVerified: true,
		})
	);
	await t.run(async (ctx) => {
		await ctx.db.insert("curiusCredentials", {
			userId,
			token: "fake-jwt",
			curiusUserId: "6361",
			curiusUsername: "feed-user",
		});
	});
	return {
		userId,
		asUser: t.withIdentity({ subject: authId }),
	};
}

function makeLibraryResponse(
	entries: Array<{
		id: string;
		link: string;
		title?: string;
		modifiedDate?: string;
		users: Array<{
			id: string;
			firstName: string;
			lastName: string;
			userLink: string;
		}>;
		highlights: Array<{
			id: string;
			userId: string;
			highlight: string;
			createdDate?: string;
		}>;
	}>
): z.infer<typeof libraryResponseSchema> {
	return {
		library: entries.map((e) => ({
			id: e.id,
			link: e.link,
			title: e.title ?? null,
			snippet: null,
			metadata: null,
			favorite: null,
			createdDate: null,
			modifiedDate: e.modifiedDate ?? null,
			lastCrawled: null,
			userIds: [],
			users: e.users,
			highlights: e.highlights.map((h) => ({
				id: h.id,
				userId: h.userId,
				linkId: e.id,
				highlight: h.highlight,
				rawHighlight: h.highlight,
				createdDate: h.createdDate,
			})),
			comments: [],
			readCount: 0,
		})) as z.infer<typeof libraryResponseSchema>["library"],
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("curius.getFriendFeed", () => {
	beforeEach(() => {
		getLibraryMock.mockReset();
	});

	it("returns empty list without hitting Curius when user has no credentials", async () => {
		const t = convexTest(schema, modules);
		const authId = "no-creds";
		await t.run(async (ctx) =>
			ctx.db.insert("users", {
				authId,
				name: "No Creds",
				email: `${authId}@example.com`,
				emailVerified: true,
			})
		);
		const asUser = t.withIdentity({ subject: authId });

		const result = await asUser.action(api.curius.getFriendFeed, {
			kind: "highlights",
		});

		expect(result.items).toEqual([]);
		expect(getLibraryMock).toHaveBeenCalledTimes(0);
	});

	it("flattens library highlights into one feed item per highlight", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUserWithCreds(t);

		getLibraryMock.mockResolvedValueOnce(
			makeLibraryResponse([
				{
					id: "link-1",
					link: "https://example.com/a",
					title: "A",
					modifiedDate: "2026-04-18T00:00:00Z",
					users: [
						{
							id: "alice",
							firstName: "Alice",
							lastName: "A",
							userLink: "alice",
						},
					],
					highlights: [
						{
							id: "h1",
							userId: "alice",
							highlight: "first",
							createdDate: "2026-04-18T10:00:00Z",
						},
						{
							id: "h2",
							userId: "alice",
							highlight: "second",
							createdDate: "2026-04-18T11:00:00Z",
						},
					],
				},
			])
		);

		const result = await asUser.action(api.curius.getFriendFeed, {
			kind: "highlights",
		});

		expect(result.items).toHaveLength(2);
		expect(result.items.map((i) => i.externalId).sort()).toEqual(["h1", "h2"]);
		// Highlights are returned newest-first.
		expect(result.items[0]?.externalId).toBe("h2");
		expect(result.items[0]?.url).toBe("https://example.com/a");
		expect(result.items[0]?.source).toBe("curius");
	});

	it("emits one item per entry for kind=bookmarks, attributed to users[0]", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUserWithCreds(t);

		getLibraryMock.mockResolvedValueOnce(
			makeLibraryResponse([
				{
					id: "link-1",
					link: "https://example.com/one",
					title: "One",
					modifiedDate: "2026-04-18T00:00:00Z",
					users: [
						{
							id: "alice",
							firstName: "Alice",
							lastName: "A",
							userLink: "alice",
						},
					],
					highlights: [],
				},
				{
					id: "link-2",
					link: "https://example.com/two",
					title: "Two",
					modifiedDate: "2026-04-17T00:00:00Z",
					users: [
						{
							id: "bob",
							firstName: "Bob",
							lastName: "B",
							userLink: "bob",
						},
					],
					highlights: [],
				},
			])
		);

		const result = await asUser.action(api.curius.getFriendFeed, {
			kind: "bookmarks",
		});

		expect(result.items).toHaveLength(2);
		expect(result.items[0]?.externalId).toBe("link-1");
		expect(result.items[0]?.title).toBe("One");
		expect(result.items[1]?.externalId).toBe("link-2");
	});

	it("hydrates authors via curiusUserMappings: migrated friends get Gloss user ids", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUserWithCreds(t);
		const migratedGlossUserId = await t.run(async (ctx) => {
			const uid = await ctx.db.insert("users", {
				authId: "migrated",
				name: "Migrated",
				email: "migrated@example.com",
				emailVerified: true,
			});
			await ctx.db.insert("curiusUserMappings", {
				curiusUserId: "alice",
				curiusUsername: "alice",
				firstName: "Alice",
				lastName: "Migrated",
				glossUserId: uid,
			});
			return uid;
		});

		getLibraryMock.mockResolvedValueOnce(
			makeLibraryResponse([
				{
					id: "link-1",
					link: "https://example.com/a",
					users: [
						{
							id: "alice",
							firstName: "Alice",
							lastName: "Stale",
							userLink: "alice",
						},
					],
					highlights: [
						{
							id: "h1",
							userId: "alice",
							highlight: "hello",
						},
					],
				},
			])
		);

		const result = await asUser.action(api.curius.getFriendFeed, {
			kind: "highlights",
		});

		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.user._id).toBe(migratedGlossUserId);
		// Mapping's name wins over the stale one embedded in the Curius entry.
		expect(result.items[0]?.user.name).toBe("Alice Migrated");
	});

	it("serves from cache on a second call within TTL (no second getLibrary)", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUserWithCreds(t);

		getLibraryMock.mockResolvedValueOnce(
			makeLibraryResponse([
				{
					id: "link-1",
					link: "https://example.com/a",
					users: [
						{
							id: "alice",
							firstName: "Alice",
							lastName: "A",
							userLink: "alice",
						},
					],
					highlights: [
						{
							id: "h1",
							userId: "alice",
							highlight: "x",
						},
					],
				},
			])
		);

		const first = await asUser.action(api.curius.getFriendFeed, {
			kind: "highlights",
		});
		const second = await asUser.action(api.curius.getFriendFeed, {
			kind: "highlights",
		});

		expect(second.items).toEqual(first.items);
		expect(getLibraryMock).toHaveBeenCalledTimes(1);

		// The cache row exists.
		const cacheRows = await t.run(async (ctx) =>
			ctx.db.query("curiusActivityCache").collect()
		);
		expect(cacheRows).toHaveLength(1);
		expect(cacheRows[0]?.kind).toBe("highlights");
	});

	it("kinds have separate cache slots: highlights and bookmarks each hit getLibrary once", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUserWithCreds(t);

		getLibraryMock.mockResolvedValue(
			makeLibraryResponse([
				{
					id: "link-1",
					link: "https://example.com/a",
					users: [
						{
							id: "alice",
							firstName: "Alice",
							lastName: "A",
							userLink: "alice",
						},
					],
					highlights: [
						{
							id: "h1",
							userId: "alice",
							highlight: "x",
						},
					],
				},
			])
		);

		await asUser.action(api.curius.getFriendFeed, { kind: "highlights" });
		await asUser.action(api.curius.getFriendFeed, { kind: "bookmarks" });

		// One outbound call per kind — they don't share cache slots.
		expect(getLibraryMock).toHaveBeenCalledTimes(2);
		const cacheRows = await t.run(async (ctx) =>
			ctx.db.query("curiusActivityCache").collect()
		);
		expect(cacheRows.map((r) => r.kind).sort()).toEqual([
			"bookmarks",
			"highlights",
		]);
	});

	it("serves stale cache on Curius errors rather than breaking the dashboard", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUserWithCreds(t);

		// First call: succeeds + writes cache.
		getLibraryMock.mockResolvedValueOnce(
			makeLibraryResponse([
				{
					id: "link-1",
					link: "https://example.com/a",
					users: [
						{
							id: "alice",
							firstName: "Alice",
							lastName: "A",
							userLink: "alice",
						},
					],
					highlights: [
						{
							id: "h1",
							userId: "alice",
							highlight: "cached",
						},
					],
				},
			])
		);
		const first = await asUser.action(api.curius.getFriendFeed, {
			kind: "highlights",
		});
		expect(first.items).toHaveLength(1);

		// Invalidate the cache so the next call re-fetches.
		await t.run(async (ctx) => {
			const row = await ctx.db
				.query("curiusActivityCache")
				.withIndex("by_userId_kind")
				.first();
			if (row) {
				await ctx.db.patch(row._id, { fetchedAt: 0 });
			}
		});

		// Second call: getLibrary throws. Stale cache should still be served.
		getLibraryMock.mockRejectedValueOnce(new Error("curius boom"));
		const second = await asUser.action(api.curius.getFriendFeed, {
			kind: "highlights",
		});
		expect(second.items).toHaveLength(1);
		expect(second.items[0]?.externalId).toBe("h1");
	});
});
