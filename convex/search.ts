import { v } from "convex/values";

import { query } from "./_generated/server";
import { getAuthenticatedUser } from "./lib/auth";
import { getFriendIds } from "./lib/friends";

export const capabilities = query({
	args: {},
	handler: async () => {
		return {
			semanticAvailable: false,
			modes: ["fts"],
			entityTypes: ["bookmark", "highlight", "comment"],
		};
	},
});

export const search = query({
	args: {
		q: v.string(),
		limit: v.optional(v.number()),
		types: v.optional(v.array(v.string())),
		tagId: v.optional(v.id("tags")),
		url: v.optional(v.string()),
		domain: v.optional(v.string()),
		after: v.optional(v.string()),
		before: v.optional(v.string()),
		sortBy: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const auth = await getAuthenticatedUser(ctx);
		if (!auth) return { results: [], total: 0 };

		const limit = args.limit ?? 20;
		const types = args.types ?? ["highlight", "bookmark", "comment"];
		const friendIds = await getFriendIds(ctx, auth.userId);
		const friendIdSet = new Set<string>(friendIds);

		type SearchResult = {
			entityType: string;
			entityId: string;
			content: string;
			url: string | null;
			userId: string;
			createdAt: number;
			highlight?: unknown;
			bookmark?: unknown;
			comment?: unknown;
		};

		const results: SearchResult[] = [];

		// Search highlights
		if (types.includes("highlight")) {
			const hits = await ctx.db
				.query("highlights")
				.withSearchIndex("search_content", (q) =>
					q.search("searchContent", args.q)
				)
				.take(limit * 2);

			for (const h of hits) {
				if (!isVisible(h.userId, h.visibility, auth.userId, friendIdSet))
					continue;
				if (args.domain && !h.url.includes(args.domain)) continue;
				if (args.url && !h.url.includes(args.url)) continue;
				if (args.after && h._creationTime < new Date(args.after).getTime())
					continue;
				if (args.before && h._creationTime > new Date(args.before).getTime())
					continue;

				results.push({
					entityType: "highlight",
					entityId: h._id,
					content: h.text,
					url: h.url,
					userId: h.userId,
					createdAt: h._creationTime,
					highlight: h,
				});
			}
		}

		// Search bookmarks
		if (types.includes("bookmark")) {
			const hits = await ctx.db
				.query("bookmarks")
				.withSearchIndex("search_content", (q) =>
					q.search("searchContent", args.q).eq("userId", auth.userId)
				)
				.take(limit * 2);

			for (const b of hits) {
				if (args.domain && !b.url.includes(args.domain)) continue;
				if (args.url && !b.url.includes(args.url)) continue;
				if (args.after && b._creationTime < new Date(args.after).getTime())
					continue;
				if (args.before && b._creationTime > new Date(args.before).getTime())
					continue;

				// Load tags
				const bookmarkTags = await ctx.db
					.query("bookmarkTags")
					.withIndex("by_bookmarkId", (q) => q.eq("bookmarkId", b._id))
					.collect();

				if (args.tagId) {
					const hasTag = bookmarkTags.some((bt) => bt.tagId === args.tagId);
					if (!hasTag) continue;
				}

				const tags = await Promise.all(
					bookmarkTags.map((bt) => ctx.db.get(bt.tagId))
				);

				results.push({
					entityType: "bookmark",
					entityId: b._id,
					content: b.title ?? b.url,
					url: b.url,
					userId: b.userId,
					createdAt: b._creationTime,
					bookmark: { ...b, tags: tags.filter(Boolean) },
				});
			}
		}

		// Search comments
		if (types.includes("comment")) {
			const hits = await ctx.db
				.query("comments")
				.withSearchIndex("search_content", (q) =>
					q.search("searchContent", args.q)
				)
				.take(limit * 2);

			for (const c of hits) {
				if (c.deletedAt) continue;
				// Check highlight visibility for the comment
				const highlight = await ctx.db.get(c.highlightId);
				if (
					!highlight ||
					!isVisible(
						highlight.userId,
						highlight.visibility,
						auth.userId,
						friendIdSet
					)
				)
					continue;

				results.push({
					entityType: "comment",
					entityId: c._id,
					content: c.content,
					url: highlight.url,
					userId: c.authorId,
					createdAt: c._creationTime,
					comment: c,
				});
			}
		}

		// Sort by creation time if requested, otherwise keep BM25 order (interleaved)
		if (args.sortBy === "created") {
			results.sort((a, b) => b.createdAt - a.createdAt);
		}

		return {
			results: results.slice(0, limit),
			total: results.length,
		};
	},
});

function isVisible(
	ownerId: string,
	visibility: string,
	viewerId: string,
	friendIdSet: Set<string>
): boolean {
	if (ownerId === viewerId) return true;
	if (visibility === "public") return true;
	if (visibility === "friends" && friendIdSet.has(ownerId)) return true;
	return false;
}
