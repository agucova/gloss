import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser, requireAuth } from "./lib/auth";
import { cascadeDeleteBookmark } from "./lib/cascade";
import { extractDomain, hashUrl, normalizeUrl } from "./lib/url";

function buildSearchContent(args: {
	title?: string;
	description?: string;
	siteName?: string;
	url: string;
}): string {
	const domain = extractDomain(args.url);
	return [args.title, args.description, args.siteName, domain]
		.filter(Boolean)
		.join(" ");
}

export const create = mutation({
	args: {
		url: v.string(),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		favicon: v.optional(v.string()),
		ogImage: v.optional(v.string()),
		ogDescription: v.optional(v.string()),
		siteName: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);

		const normalizedUrl = normalizeUrl(args.url);
		const urlHash = await hashUrl(normalizedUrl);

		// Check uniqueness
		const existing = await ctx.db
			.query("bookmarks")
			.withIndex("by_userId_urlHash", (q) =>
				q.eq("userId", userId).eq("urlHash", urlHash)
			)
			.first();
		if (existing) throw new Error("URL already bookmarked");

		const searchContent = buildSearchContent({
			title: args.title,
			description: args.description,
			siteName: args.siteName,
			url: normalizedUrl,
		});

		const bookmarkId = await ctx.db.insert("bookmarks", {
			userId,
			url: normalizedUrl,
			urlHash,
			title: args.title,
			description: args.description,
			favicon: args.favicon,
			ogImage: args.ogImage,
			ogDescription: args.ogDescription,
			siteName: args.siteName,
			searchContent,
		});

		// Handle tags
		if (args.tags && args.tags.length > 0) {
			const tagIds = await getOrCreateTags(ctx, userId, args.tags);
			for (const tagId of tagIds) {
				await ctx.db.insert("bookmarkTags", {
					bookmarkId,
					tagId,
				});
			}
		}

		return bookmarkId;
	},
});

export const remove = mutation({
	args: { id: v.id("bookmarks") },
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Bookmark not found");
		if (existing.userId !== userId)
			throw new Error("Not authorized to delete this bookmark");

		await cascadeDeleteBookmark(ctx, args.id);
		return { success: true };
	},
});

export const list = query({
	args: {
		paginationOpts: v.any(),
		tagId: v.optional(v.id("tags")),
		search: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const auth = await getAuthenticatedUser(ctx);
		if (!auth) return { page: [], isDone: true, continueCursor: "" };

		if (args.search) {
			// Use FTS
			const results = await ctx.db
				.query("bookmarks")
				.withSearchIndex("search_content", (q) =>
					q.search("searchContent", args.search!).eq("userId", auth.userId)
				)
				.take(50);

			// If tag filter, post-filter
			if (args.tagId) {
				const bookmarkTagDocs = await ctx.db
					.query("bookmarkTags")
					.withIndex("by_tagId", (q) => q.eq("tagId", args.tagId!))
					.collect();
				const taggedBookmarkIds = new Set(
					bookmarkTagDocs.map((bt) => bt.bookmarkId)
				);
				return {
					page: results.filter((b) => taggedBookmarkIds.has(b._id)),
					isDone: true,
					continueCursor: "",
				};
			}

			return { page: results, isDone: true, continueCursor: "" };
		}

		// If tag filter without search, get tagged bookmark IDs first
		if (args.tagId) {
			const bookmarkTagDocs = await ctx.db
				.query("bookmarkTags")
				.withIndex("by_tagId", (q) => q.eq("tagId", args.tagId!))
				.collect();
			const taggedBookmarkIds = new Set(
				bookmarkTagDocs.map((bt) => bt.bookmarkId)
			);

			const allBookmarks = await ctx.db
				.query("bookmarks")
				.withIndex("by_userId", (q) => q.eq("userId", auth.userId))
				.order("desc")
				.collect();

			const filtered = allBookmarks.filter((b) => taggedBookmarkIds.has(b._id));
			return { page: filtered, isDone: true, continueCursor: "" };
		}

		return ctx.db
			.query("bookmarks")
			.withIndex("by_userId", (q) => q.eq("userId", auth.userId))
			.order("desc")
			.paginate(args.paginationOpts);
	},
});

export const checkUrl = query({
	args: { url: v.string() },
	handler: async (ctx, args) => {
		const auth = await getAuthenticatedUser(ctx);
		if (!auth) return null;

		const normalizedUrl = normalizeUrl(args.url);
		const urlHash = await hashUrl(normalizedUrl);

		const existing = await ctx.db
			.query("bookmarks")
			.withIndex("by_userId_urlHash", (q) =>
				q.eq("userId", auth.userId).eq("urlHash", urlHash)
			)
			.first();

		return existing;
	},
});

export const update = mutation({
	args: {
		id: v.id("bookmarks"),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Bookmark not found");
		if (existing.userId !== userId)
			throw new Error("Not authorized to update this bookmark");

		const updates: Record<string, unknown> = {};
		if (args.title !== undefined) updates.title = args.title;
		if (args.description !== undefined) updates.description = args.description;

		// Recompute search content
		updates.searchContent = buildSearchContent({
			title: args.title ?? existing.title ?? undefined,
			description: args.description ?? existing.description ?? undefined,
			siteName: existing.siteName ?? undefined,
			url: existing.url,
		});

		await ctx.db.patch(args.id, updates);

		// Sync tags if provided
		if (args.tags !== undefined) {
			const tagIds = await getOrCreateTags(ctx, userId, args.tags);
			await syncBookmarkTags(ctx, args.id, tagIds);
		}

		return args.id;
	},
});

export const listTags = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const auth = await getAuthenticatedUser(ctx);
		if (!auth) return [];

		const tags = await ctx.db
			.query("tags")
			.withIndex("by_userId", (q) => q.eq("userId", auth.userId))
			.collect();

		// Count bookmarks per tag
		const tagsWithCounts = await Promise.all(
			tags.map(async (tag) => {
				const bookmarkTags = await ctx.db
					.query("bookmarkTags")
					.withIndex("by_tagId", (q) => q.eq("tagId", tag._id))
					.collect();
				return { ...tag, bookmarkCount: bookmarkTags.length };
			})
		);

		// Sort: system tags first, then by count desc
		tagsWithCounts.sort((a, b) => {
			if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
			return b.bookmarkCount - a.bookmarkCount;
		});

		return args.limit ? tagsWithCounts.slice(0, args.limit) : tagsWithCounts;
	},
});

export const toggleFavorite = mutation({
	args: { id: v.id("bookmarks") },
	handler: async (ctx, args) => {
		return toggleSystemTag(ctx, args.id, "favorites");
	},
});

export const toggleReadLater = mutation({
	args: { id: v.id("bookmarks") },
	handler: async (ctx, args) => {
		return toggleSystemTag(ctx, args.id, "to-read");
	},
});

// ─── Helper functions ───────────────────────────────

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const SYSTEM_TAG_COLORS: Record<string, string> = {
	favorites: "#fbbf24",
	"to-read": "#60a5fa",
};

async function getOrCreateTags(
	ctx: MutationCtx,
	userId: Id<"users">,
	tagNames: string[]
): Promise<Id<"tags">[]> {
	const ids: Id<"tags">[] = [];
	for (const name of tagNames) {
		const normalized = name.toLowerCase().trim();
		const existing = await ctx.db
			.query("tags")
			.withIndex("by_userId_name", (q) =>
				q.eq("userId", userId).eq("name", normalized)
			)
			.first();

		if (existing) {
			ids.push(existing._id);
		} else {
			const isSystem = normalized in SYSTEM_TAG_COLORS;
			const id = await ctx.db.insert("tags", {
				userId,
				name: normalized,
				color: SYSTEM_TAG_COLORS[normalized],
				isSystem,
			});
			ids.push(id);
		}
	}
	return ids;
}

async function syncBookmarkTags(
	ctx: MutationCtx,
	bookmarkId: Id<"bookmarks">,
	tagIds: Id<"tags">[]
) {
	// Delete existing associations
	const existing = await ctx.db
		.query("bookmarkTags")
		.withIndex("by_bookmarkId", (q) => q.eq("bookmarkId", bookmarkId))
		.collect();
	for (const bt of existing) {
		await ctx.db.delete(bt._id);
	}

	// Insert new associations
	for (const tagId of tagIds) {
		await ctx.db.insert("bookmarkTags", { bookmarkId, tagId });
	}
}

async function toggleSystemTag(
	ctx: MutationCtx,
	bookmarkId: Id<"bookmarks">,
	tagName: string
) {
	const { userId } = await requireAuth(ctx);
	const bookmark = await ctx.db.get(bookmarkId);
	if (!bookmark) throw new Error("Bookmark not found");
	if (bookmark.userId !== userId)
		throw new Error("Not authorized to modify this bookmark");

	// Ensure system tag exists
	let tag = await ctx.db
		.query("tags")
		.withIndex("by_userId_name", (q) =>
			q.eq("userId", userId).eq("name", tagName)
		)
		.first();

	if (!tag) {
		const tagId = await ctx.db.insert("tags", {
			userId,
			name: tagName,
			color: SYSTEM_TAG_COLORS[tagName],
			isSystem: true,
		});
		tag = await ctx.db.get(tagId);
	}
	if (!tag) throw new Error("Failed to create tag");

	// Check if bookmark already has this tag
	const existingLink = await ctx.db
		.query("bookmarkTags")
		.withIndex("by_bookmark_tag", (q) =>
			q.eq("bookmarkId", bookmarkId).eq("tagId", tag!._id)
		)
		.first();

	if (existingLink) {
		await ctx.db.delete(existingLink._id);
		return { added: false };
	}

	await ctx.db.insert("bookmarkTags", {
		bookmarkId,
		tagId: tag._id,
	});
	return { added: true };
}
