import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

describe("highlights", () => {
	it("should create a highlight", async () => {
		const t = convexTest(schema);
		const asUser = t.withIdentity({
			name: "Test User",
			email: "test@example.com",
		});

		// First create a user in the DB so auth lookup works
		await t.run(async (ctx) => {
			await ctx.db.insert("users", {
				name: "Test User",
				email: "test@example.com",
				emailVerified: true,
				profileVisibility: "public",
				highlightsVisibility: "friends",
				bookmarksVisibility: "public",
				highlightDisplayFilter: "friends",
				commentDisplayMode: "collapsed",
			});
		});

		const highlightId = await asUser.mutation(api.highlights.create, {
			url: "https://example.com/article",
			selector: {
				quote: {
					type: "TextQuoteSelector",
					exact: "test text",
					prefix: "",
					suffix: "",
				},
			},
			text: "test text",
			visibility: "public",
		});

		expect(highlightId).toBeDefined();

		// Verify it's in the database
		const highlights = await t.run(async (ctx) => {
			return await ctx.db.query("highlights").collect();
		});

		expect(highlights).toHaveLength(1);
		expect(highlights[0]?.text).toBe("test text");
		expect(highlights[0]?.visibility).toBe("public");
	});

	it("should delete a highlight and cascade to comments", async () => {
		const t = convexTest(schema);
		const asUser = t.withIdentity({
			name: "Test User",
			email: "test@example.com",
		});

		// Create user
		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				name: "Test User",
				email: "test@example.com",
				emailVerified: true,
			});
		});

		// Create highlight
		const highlightId = await asUser.mutation(api.highlights.create, {
			url: "https://example.com/article",
			selector: {},
			text: "some highlighted text",
		});

		// Create a comment on the highlight
		await t.run(async (ctx) => {
			await ctx.db.insert("comments", {
				highlightId,
				authorId: userId,
				content: "a comment",
				searchContent: "a comment",
			});
		});

		// Delete the highlight
		await asUser.mutation(api.highlights.remove, { id: highlightId });

		// Verify both highlight and comment are gone
		const highlights = await t.run(async (ctx) =>
			ctx.db.query("highlights").collect()
		);
		const comments = await t.run(async (ctx) =>
			ctx.db.query("comments").collect()
		);

		expect(highlights).toHaveLength(0);
		expect(comments).toHaveLength(0);
	});

	it("should filter highlights by visibility", async () => {
		const t = convexTest(schema);

		// Create two users
		const [userId1, userId2] = await t.run(async (ctx) => {
			const u1 = await ctx.db.insert("users", {
				name: "User 1",
				email: "user1@example.com",
				emailVerified: true,
				highlightDisplayFilter: "anyone",
			});
			const u2 = await ctx.db.insert("users", {
				name: "User 2",
				email: "user2@example.com",
				emailVerified: true,
			});
			return [u1, u2];
		});

		// Create highlights: one public, one private
		await t.run(async (ctx) => {
			const urlHash = "abc123";
			await ctx.db.insert("highlights", {
				userId: userId2,
				url: "https://example.com",
				urlHash,
				selector: {},
				text: "public highlight",
				visibility: "public",
				searchContent: "public highlight",
			});
			await ctx.db.insert("highlights", {
				userId: userId2,
				url: "https://example.com",
				urlHash,
				selector: {},
				text: "private highlight",
				visibility: "private",
				searchContent: "private highlight",
			});
		});

		// Query as user1 (not a friend) — should only see public
		const asUser1 = t.withIdentity({
			name: "User 1",
			email: "user1@example.com",
		});
		const results = await asUser1.query(api.highlights.getByUrl, {
			url: "https://example.com",
		});

		const texts = results.map((h: { text: string }) => h.text);
		expect(texts).toContain("public highlight");
		expect(texts).not.toContain("private highlight");
	});
});
