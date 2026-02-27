import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

describe("friendships", () => {
	it("should send and accept a friend request", async () => {
		const t = convexTest(schema);

		// Create two users
		const [userId1, userId2] = await t.run(async (ctx) => {
			const u1 = await ctx.db.insert("users", {
				name: "User 1",
				email: "user1@example.com",
				emailVerified: true,
			});
			const u2 = await ctx.db.insert("users", {
				name: "User 2",
				email: "user2@example.com",
				emailVerified: true,
			});
			return [u1, u2];
		});

		const asUser1 = t.withIdentity({
			name: "User 1",
			email: "user1@example.com",
		});
		const asUser2 = t.withIdentity({
			name: "User 2",
			email: "user2@example.com",
		});

		// User 1 sends friend request to User 2
		const friendshipId = await asUser1.mutation(api.friendships.sendRequest, {
			addresseeId: userId2,
		});
		expect(friendshipId).toBeDefined();

		// Verify it's pending
		const friendships = await t.run(async (ctx) =>
			ctx.db.query("friendships").collect()
		);
		expect(friendships).toHaveLength(1);
		expect(friendships[0]?.status).toBe("pending");

		// User 2 accepts
		await asUser2.mutation(api.friendships.accept, { id: friendshipId });

		// Verify it's accepted
		const updated = await t.run(async (ctx) =>
			ctx.db.query("friendships").collect()
		);
		expect(updated[0]?.status).toBe("accepted");
	});

	it("should auto-accept mutual friend requests", async () => {
		const t = convexTest(schema);

		const [userId1, userId2] = await t.run(async (ctx) => {
			const u1 = await ctx.db.insert("users", {
				name: "User 1",
				email: "user1@example.com",
				emailVerified: true,
			});
			const u2 = await ctx.db.insert("users", {
				name: "User 2",
				email: "user2@example.com",
				emailVerified: true,
			});
			return [u1, u2];
		});

		const asUser1 = t.withIdentity({
			name: "User 1",
			email: "user1@example.com",
		});
		const asUser2 = t.withIdentity({
			name: "User 2",
			email: "user2@example.com",
		});

		// User 1 requests User 2
		await asUser1.mutation(api.friendships.sendRequest, {
			addresseeId: userId2,
		});

		// User 2 requests User 1 — should auto-accept
		await asUser2.mutation(api.friendships.sendRequest, {
			addresseeId: userId1,
		});

		const friendships = await t.run(async (ctx) =>
			ctx.db.query("friendships").collect()
		);
		expect(friendships).toHaveLength(1);
		expect(friendships[0]?.status).toBe("accepted");
	});

	it("should prevent self-friending", async () => {
		const t = convexTest(schema);

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				name: "User 1",
				email: "user1@example.com",
				emailVerified: true,
			});
		});

		const asUser = t.withIdentity({
			name: "User 1",
			email: "user1@example.com",
		});

		await expect(
			asUser.mutation(api.friendships.sendRequest, { addresseeId: userId })
		).rejects.toThrowError("Cannot friend yourself");
	});
});
