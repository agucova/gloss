import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.test).*s");

async function seedTwoUsers(
	t: ReturnType<typeof convexTest>,
	targetVisibility: "public" | "friends" | "private"
) {
	const ownerAuthId = "test_auth_owner";
	const viewerAuthId = "test_auth_viewer";
	return t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", {
			authId: ownerAuthId,
			name: "Owner",
			email: "owner@example.com",
			emailVerified: true,
			username: "owner",
			profileVisibility: targetVisibility,
			highlightsVisibility: "friends",
			bookmarksVisibility: "public",
		});
		const viewerId = await ctx.db.insert("users", {
			authId: viewerAuthId,
			name: "Viewer",
			email: "viewer@example.com",
			emailVerified: true,
			username: "viewer",
		});
		return { ownerId, viewerId, ownerAuthId, viewerAuthId };
	});
}

async function makeFriends(
	t: ReturnType<typeof convexTest>,
	ownerId: string,
	viewerId: string
) {
	await t.run(async (ctx) => {
		await ctx.db.insert("friendships", {
			requesterId: viewerId as any,
			addresseeId: ownerId as any,
			status: "accepted",
		});
	});
}

describe("users.getByUsername visibility", () => {
	it("returns the profile when the target is public (unauthenticated)", async () => {
		const t = convexTest(schema, modules);
		await seedTwoUsers(t, "public");

		const profile = await t.query(api.users.getByUsername, {
			username: "owner",
		});
		expect(profile).not.toBeNull();
		expect(profile?.username).toBe("owner");
	});

	it("returns the profile when the target is public (authenticated non-friend)", async () => {
		const t = convexTest(schema, modules);
		const { viewerAuthId } = await seedTwoUsers(t, "public");

		const asViewer = t.withIdentity({
			subject: viewerAuthId,
			email: "viewer@example.com",
		});
		const profile = await asViewer.query(api.users.getByUsername, {
			username: "owner",
		});
		expect(profile).not.toBeNull();
	});

	it("returns null when target is friends-only and viewer is unauthenticated", async () => {
		const t = convexTest(schema, modules);
		await seedTwoUsers(t, "friends");

		const profile = await t.query(api.users.getByUsername, {
			username: "owner",
		});
		expect(profile).toBeNull();
	});

	it("returns null when target is friends-only and viewer is not a friend", async () => {
		const t = convexTest(schema, modules);
		const { viewerAuthId } = await seedTwoUsers(t, "friends");

		const asViewer = t.withIdentity({
			subject: viewerAuthId,
			email: "viewer@example.com",
		});
		const profile = await asViewer.query(api.users.getByUsername, {
			username: "owner",
		});
		expect(profile).toBeNull();
	});

	it("returns the profile when target is friends-only and viewer IS a friend", async () => {
		const t = convexTest(schema, modules);
		const { ownerId, viewerId, viewerAuthId } = await seedTwoUsers(
			t,
			"friends"
		);
		await makeFriends(t, ownerId, viewerId);

		const asViewer = t.withIdentity({
			subject: viewerAuthId,
			email: "viewer@example.com",
		});
		const profile = await asViewer.query(api.users.getByUsername, {
			username: "owner",
		});
		expect(profile).not.toBeNull();
	});

	it("returns null for everyone when target is private (except the owner)", async () => {
		const t = convexTest(schema, modules);
		const { ownerAuthId, viewerId, ownerId, viewerAuthId } = await seedTwoUsers(
			t,
			"private"
		);
		// Even as a friend, a private profile is hidden.
		await makeFriends(t, ownerId, viewerId);

		const unauth = await t.query(api.users.getByUsername, {
			username: "owner",
		});
		expect(unauth).toBeNull();

		const asViewer = t.withIdentity({
			subject: viewerAuthId,
			email: "viewer@example.com",
		});
		const stranger = await asViewer.query(api.users.getByUsername, {
			username: "owner",
		});
		expect(stranger).toBeNull();

		// Owner can still see their own profile.
		const asOwner = t.withIdentity({
			subject: ownerAuthId,
			email: "owner@example.com",
		});
		const own = await asOwner.query(api.users.getByUsername, {
			username: "owner",
		});
		expect(own).not.toBeNull();
		expect(own?.isOwnProfile).toBe(true);
	});
});

describe("users.getUserFriends requires auth", () => {
	it("returns [] when unauthenticated, even for a public profile", async () => {
		const t = convexTest(schema, modules);
		const { ownerId } = await seedTwoUsers(t, "public");

		const friends = await t.query(api.users.getUserFriends, {
			userId: ownerId as any,
		});
		expect(friends).toEqual([]);
	});

	it("returns friends for an authenticated viewer when target is public", async () => {
		const t = convexTest(schema, modules);
		const { ownerId, viewerId, viewerAuthId } = await seedTwoUsers(t, "public");
		await makeFriends(t, ownerId, viewerId);

		const asViewer = t.withIdentity({
			subject: viewerAuthId,
			email: "viewer@example.com",
		});
		const friends = await asViewer.query(api.users.getUserFriends, {
			userId: ownerId as any,
		});
		expect(friends).toHaveLength(1);
	});

	it("returns [] for a private profile even if viewer is authenticated", async () => {
		const t = convexTest(schema, modules);
		const { ownerId, viewerAuthId } = await seedTwoUsers(t, "private");

		const asViewer = t.withIdentity({
			subject: viewerAuthId,
			email: "viewer@example.com",
		});
		const friends = await asViewer.query(api.users.getUserFriends, {
			userId: ownerId as any,
		});
		expect(friends).toEqual([]);
	});
});

describe("users.getUserHighlights visibility", () => {
	it("returns empty page when target profile is private and viewer is not owner", async () => {
		const t = convexTest(schema, modules);
		const { ownerId, viewerAuthId } = await seedTwoUsers(t, "private");

		// Seed a public highlight on the owner — visibility-gating the
		// profile should still hide it.
		await t.run(async (ctx) => {
			await ctx.db.insert("highlights", {
				userId: ownerId as any,
				url: "https://example.com",
				urlHash: "hash",
				selector: { quote: { type: "TextQuoteSelector", exact: "x" } },
				text: "x",
				visibility: "public",
			});
		});

		const asViewer = t.withIdentity({
			subject: viewerAuthId,
			email: "viewer@example.com",
		});
		const result = await asViewer.query(api.users.getUserHighlights, {
			userId: ownerId as any,
			paginationOpts: { numItems: 10, cursor: null },
		});
		expect(result.page).toEqual([]);
	});
});
