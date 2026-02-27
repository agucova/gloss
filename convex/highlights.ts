import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";

import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser, requireAuth } from "./lib/auth";
import { cascadeDeleteHighlight } from "./lib/cascade";
import { getFriendIds } from "./lib/friends";
import { extractDomain, hashUrl, normalizeUrl } from "./lib/url";

/**
 * Get highlights for a URL, filtered by visibility and user display preferences.
 */
export const getByUrl = query({
	args: { url: v.string() },
	handler: async (ctx, args) => {
		const normalizedUrl = normalizeUrl(args.url);
		const urlHash = await hashUrl(normalizedUrl);

		// Fetch all highlights for this URL
		const allHighlights = await ctx.db
			.query("highlights")
			.withIndex("by_urlHash", (q) => q.eq("urlHash", urlHash))
			.order("desc")
			.collect();

		const auth = await getAuthenticatedUser(ctx);

		if (!auth) {
			// Unauthenticated: public only
			const filtered = allHighlights.filter((h) => h.visibility === "public");
			return hydrateHighlights(ctx, filtered);
		}

		// Get user's display filter preference
		const userDoc = await ctx.db.get(auth.userId);
		const displayFilter = userDoc?.highlightDisplayFilter ?? "friends";

		if (displayFilter === "me") {
			const filtered = allHighlights.filter((h) => h.userId === auth.userId);
			return hydrateHighlights(ctx, filtered);
		}

		const friendIds = await getFriendIds(ctx, auth.userId);
		const friendIdSet = new Set<string>(friendIds);

		if (displayFilter === "friends") {
			const filtered = allHighlights.filter((h) => {
				if (h.userId === auth.userId) return true;
				if (
					friendIdSet.has(h.userId) &&
					(h.visibility === "public" || h.visibility === "friends")
				)
					return true;
				return false;
			});
			return hydrateHighlights(ctx, filtered);
		}

		// "anyone" filter: public + own + friends' (friends visibility)
		const filtered = allHighlights.filter((h) => {
			if (h.visibility === "public") return true;
			if (h.userId === auth.userId) return true;
			if (friendIdSet.has(h.userId) && h.visibility === "friends") return true;
			return false;
		});
		return hydrateHighlights(ctx, filtered);
	},
});

/**
 * Create a new highlight.
 */
export const create = mutation({
	args: {
		url: v.string(),
		selector: v.any(),
		text: v.string(),
		visibility: v.optional(
			v.union(v.literal("private"), v.literal("friends"), v.literal("public"))
		),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);

		const normalizedUrl = normalizeUrl(args.url);
		const urlHash = await hashUrl(normalizedUrl);
		const domain = extractDomain(normalizedUrl);
		const searchContent = `${args.text} ${domain}`;

		const id = await ctx.db.insert("highlights", {
			userId,
			url: normalizedUrl,
			urlHash,
			selector: args.selector,
			text: args.text,
			visibility: args.visibility ?? "friends",
			searchContent,
		});

		return id;
	},
});

/**
 * List own highlights (paginated).
 */
export const listMine = query({
	args: { paginationOpts: v.any() },
	handler: async (ctx, args) => {
		const auth = await getAuthenticatedUser(ctx);
		if (!auth) return { page: [], isDone: true, continueCursor: "" };

		return ctx.db
			.query("highlights")
			.withIndex("by_userId", (q) => q.eq("userId", auth.userId))
			.order("desc")
			.paginate(args.paginationOpts);
	},
});

/**
 * Update own highlight.
 */
export const update = mutation({
	args: {
		id: v.id("highlights"),
		visibility: v.optional(
			v.union(v.literal("private"), v.literal("friends"), v.literal("public"))
		),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Highlight not found");
		if (existing.userId !== userId)
			throw new Error("Not authorized to update this highlight");

		const updates: Record<string, unknown> = {
			updatedAt: Date.now(),
		};
		if (args.visibility !== undefined) {
			updates.visibility = args.visibility;
		}

		await ctx.db.patch(args.id, updates);
		return args.id;
	},
});

/**
 * Delete own highlight (cascades to comments + mentions).
 */
export const remove = mutation({
	args: { id: v.id("highlights") },
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing) throw new Error("Highlight not found");
		if (existing.userId !== userId)
			throw new Error("Not authorized to delete this highlight");

		await cascadeDeleteHighlight(ctx, args.id);
		return { success: true };
	},
});

// Helper to hydrate highlights with user info
async function hydrateHighlights(
	ctx: { db: { get: (id: Id<"users">) => Promise<unknown> } },
	highlights: Array<{
		_id: Id<"highlights">;
		_creationTime: number;
		userId: Id<"users">;
		url: string;
		urlHash: string;
		selector: unknown;
		text: string;
		visibility: string;
		searchContent?: string;
		importSource?: string;
		externalId?: string;
		importedAt?: number;
		updatedAt?: number;
	}>
) {
	const userIds = [...new Set(highlights.map((h) => h.userId))];
	const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
	const userMap = new Map<
		string,
		{ _id: Id<"users">; name: string; image?: string }
	>();
	for (const u of users) {
		if (u) {
			const user = u as { _id: Id<"users">; name: string; image?: string };
			userMap.set(user._id, {
				_id: user._id,
				name: user.name,
				image: user.image,
			});
		}
	}

	return highlights.map((h) => ({
		...h,
		user: userMap.get(h.userId) ?? null,
	}));
}
