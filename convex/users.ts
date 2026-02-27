import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser, requireAuth } from "./lib/auth";
import { areFriends, getFriendIds } from "./lib/friends";

export const checkUsername = query({
	args: { username: v.string() },
	handler: async (ctx, args) => {
		const normalized = args.username.toLowerCase().trim();
		const existing = await ctx.db
			.query("users")
			.withIndex("by_username", (q) => q.eq("username", normalized))
			.first();
		return { available: !existing };
	},
});

export const getMe = query({
	args: {},
	handler: async (ctx) => {
		const auth = await getAuthenticatedUser(ctx);
		if (!auth) return null;

		const user = await ctx.db.get(auth.userId);
		if (!user) return null;

		// Counts
		const highlights = await ctx.db
			.query("highlights")
			.withIndex("by_userId", (q) => q.eq("userId", auth.userId))
			.collect();
		const bookmarks = await ctx.db
			.query("bookmarks")
			.withIndex("by_userId", (q) => q.eq("userId", auth.userId))
			.collect();
		const friendIds = await getFriendIds(ctx, auth.userId);

		return {
			...user,
			highlightCount: highlights.length,
			bookmarkCount: bookmarks.length,
			friendCount: friendIds.length,
		};
	},
});

export const updateProfile = mutation({
	args: {
		name: v.optional(v.string()),
		bio: v.optional(v.string()),
		website: v.optional(v.string()),
		twitterHandle: v.optional(v.string()),
		githubHandle: v.optional(v.string()),
		image: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);

		const updates: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) updates.name = args.name;
		if (args.bio !== undefined) updates.bio = args.bio;
		if (args.website !== undefined) updates.website = args.website;
		if (args.twitterHandle !== undefined)
			updates.twitterHandle = args.twitterHandle;
		if (args.githubHandle !== undefined)
			updates.githubHandle = args.githubHandle;
		if (args.image !== undefined) updates.image = args.image;

		await ctx.db.patch(userId, updates);
		return userId;
	},
});

export const getSettings = query({
	args: {},
	handler: async (ctx) => {
		const auth = await getAuthenticatedUser(ctx);
		if (!auth) return null;

		const user = await ctx.db.get(auth.userId);
		if (!user) return null;

		return {
			profileVisibility: user.profileVisibility ?? "public",
			highlightsVisibility: user.highlightsVisibility ?? "friends",
			bookmarksVisibility: user.bookmarksVisibility ?? "public",
			highlightDisplayFilter: user.highlightDisplayFilter ?? "friends",
			commentDisplayMode: user.commentDisplayMode ?? "collapsed",
		};
	},
});

export const updateSettings = mutation({
	args: {
		profileVisibility: v.optional(
			v.union(v.literal("private"), v.literal("friends"), v.literal("public"))
		),
		highlightsVisibility: v.optional(
			v.union(v.literal("private"), v.literal("friends"), v.literal("public"))
		),
		bookmarksVisibility: v.optional(
			v.union(v.literal("private"), v.literal("friends"), v.literal("public"))
		),
		highlightDisplayFilter: v.optional(
			v.union(v.literal("anyone"), v.literal("friends"), v.literal("me"))
		),
		commentDisplayMode: v.optional(
			v.union(v.literal("expanded"), v.literal("collapsed"))
		),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);

		const updates: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.profileVisibility !== undefined)
			updates.profileVisibility = args.profileVisibility;
		if (args.highlightsVisibility !== undefined)
			updates.highlightsVisibility = args.highlightsVisibility;
		if (args.bookmarksVisibility !== undefined)
			updates.bookmarksVisibility = args.bookmarksVisibility;
		if (args.highlightDisplayFilter !== undefined)
			updates.highlightDisplayFilter = args.highlightDisplayFilter;
		if (args.commentDisplayMode !== undefined)
			updates.commentDisplayMode = args.commentDisplayMode;

		await ctx.db.patch(userId, updates);
		return { success: true };
	},
});

export const setUsername = mutation({
	args: { username: v.string() },
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const normalized = args.username.toLowerCase().trim();

		// Check uniqueness
		const existing = await ctx.db
			.query("users")
			.withIndex("by_username", (q) => q.eq("username", normalized))
			.first();
		if (existing && existing._id !== userId)
			throw new Error("Username already taken");

		await ctx.db.patch(userId, { username: normalized, updatedAt: Date.now() });
		return { success: true };
	},
});

export const getByUsername = query({
	args: { username: v.string() },
	handler: async (ctx, args) => {
		const normalized = args.username.toLowerCase().trim();
		const user = await ctx.db
			.query("users")
			.withIndex("by_username", (q) => q.eq("username", normalized))
			.first();
		if (!user) return null;

		const auth = await getAuthenticatedUser(ctx);
		const isOwnProfile = auth?.userId === user._id;
		const isFriend = auth
			? await areFriends(ctx, auth.userId, user._id)
			: false;

		// Count highlights based on visibility
		const highlights = await ctx.db
			.query("highlights")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.collect();
		let highlightCount: number;
		if (isOwnProfile) {
			highlightCount = highlights.length;
		} else if (isFriend) {
			highlightCount = highlights.filter(
				(h) => h.visibility === "public" || h.visibility === "friends"
			).length;
		} else {
			highlightCount = highlights.filter(
				(h) => h.visibility === "public"
			).length;
		}

		// Count bookmarks based on user's bookmarks visibility setting
		const bookmarksVisibility = user.bookmarksVisibility ?? "public";
		let bookmarkCount = 0;
		if (
			isOwnProfile ||
			bookmarksVisibility === "public" ||
			(bookmarksVisibility === "friends" && isFriend)
		) {
			const bookmarks = await ctx.db
				.query("bookmarks")
				.withIndex("by_userId", (q) => q.eq("userId", user._id))
				.collect();
			bookmarkCount = bookmarks.length;
		}

		const friendIds = await getFriendIds(ctx, user._id);

		return {
			_id: user._id,
			name: user.name,
			username: user.username,
			bio: user.bio,
			website: user.website,
			twitterHandle: user.twitterHandle,
			githubHandle: user.githubHandle,
			image: user.image,
			profileVisibility: user.profileVisibility ?? "public",
			highlightCount,
			bookmarkCount,
			friendCount: friendIds.length,
			isOwnProfile,
			isFriend,
		};
	},
});

export const getUserHighlights = query({
	args: {
		userId: v.id("users"),
		paginationOpts: v.any(),
		search: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const auth = await getAuthenticatedUser(ctx);
		const isOwn = auth?.userId === args.userId;
		const isFriend = auth
			? await areFriends(ctx, auth.userId, args.userId)
			: false;

		if (args.search) {
			const results = await ctx.db
				.query("highlights")
				.withSearchIndex("search_content", (q) =>
					q.search("searchContent", args.search!).eq("userId", args.userId)
				)
				.take(50);
			return {
				page: filterHighlightsByVisibility(results, isOwn, isFriend),
				isDone: true,
				continueCursor: "",
			};
		}

		const results = await ctx.db
			.query("highlights")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.order("desc")
			.paginate(args.paginationOpts);

		return {
			...results,
			page: filterHighlightsByVisibility(results.page, isOwn, isFriend),
		};
	},
});

export const getUserBookmarks = query({
	args: {
		userId: v.id("users"),
		paginationOpts: v.any(),
		tagId: v.optional(v.id("tags")),
		search: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const auth = await getAuthenticatedUser(ctx);
		const isOwn = auth?.userId === args.userId;
		const isFriend = auth
			? await areFriends(ctx, auth.userId, args.userId)
			: false;

		// Check bookmarks visibility
		const targetUser = await ctx.db.get(args.userId);
		const bookmarksVis = targetUser?.bookmarksVisibility ?? "public";
		if (
			!isOwn &&
			(bookmarksVis === "private" || (bookmarksVis === "friends" && !isFriend))
		) {
			return { page: [], isDone: true, continueCursor: "" };
		}

		if (args.search) {
			const results = await ctx.db
				.query("bookmarks")
				.withSearchIndex("search_content", (q) =>
					q.search("searchContent", args.search!).eq("userId", args.userId)
				)
				.take(50);
			return { page: results, isDone: true, continueCursor: "" };
		}

		return ctx.db
			.query("bookmarks")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.order("desc")
			.paginate(args.paginationOpts);
	},
});

export const getUserTags = query({
	args: { userId: v.id("users") },
	handler: async (ctx, args) => {
		const tags = await ctx.db
			.query("tags")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();

		const tagsWithCounts = await Promise.all(
			tags.map(async (tag) => {
				const bts = await ctx.db
					.query("bookmarkTags")
					.withIndex("by_tagId", (q) => q.eq("tagId", tag._id))
					.collect();
				return { ...tag, bookmarkCount: bts.length };
			})
		);

		tagsWithCounts.sort((a, b) => {
			if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
			return b.bookmarkCount - a.bookmarkCount;
		});

		return tagsWithCounts;
	},
});

export const getUserFriends = query({
	args: { userId: v.id("users") },
	handler: async (ctx, args) => {
		const friendIds = await getFriendIds(ctx, args.userId);
		const friends = await Promise.all(friendIds.map((id) => ctx.db.get(id)));
		return friends.filter(Boolean).map((f) => ({
			_id: f!._id,
			name: f!.name,
			image: f!.image,
			username: f!.username,
		}));
	},
});

// Helper for visibility filtering
function filterHighlightsByVisibility(
	highlights: Array<{ visibility: string }>,
	isOwn: boolean,
	isFriend: boolean
) {
	if (isOwn) return highlights;
	return highlights.filter((h) => {
		if (h.visibility === "public") return true;
		if (h.visibility === "friends" && isFriend) return true;
		return false;
	});
}
