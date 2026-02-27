import { v } from "convex/values";

import { query } from "./_generated/server";
import { getAuthenticatedUser } from "./lib/auth";
import { getFriendIds } from "./lib/friends";

export const feedHighlights = query({
	args: { paginationOpts: v.any() },
	handler: async (ctx, args) => {
		const auth = await getAuthenticatedUser(ctx);
		if (!auth) return { page: [], isDone: true, continueCursor: "" };

		const friendIds = await getFriendIds(ctx, auth.userId);
		if (friendIds.length === 0)
			return { page: [], isDone: true, continueCursor: "" };

		// Query each friend's recent highlights and merge
		const allHighlights = [];
		for (const friendId of friendIds) {
			const highlights = await ctx.db
				.query("highlights")
				.withIndex("by_userId", (q) => q.eq("userId", friendId))
				.order("desc")
				.take(50);

			for (const h of highlights) {
				if (h.visibility === "public" || h.visibility === "friends") {
					allHighlights.push(h);
				}
			}
		}

		// Sort by creation time desc
		allHighlights.sort((a, b) => b._creationTime - a._creationTime);

		// Hydrate with user info
		const userCache = new Map<string, unknown>();
		const hydrated = await Promise.all(
			allHighlights.map(async (h) => {
				let user = userCache.get(h.userId);
				if (!user) {
					user = await ctx.db.get(h.userId);
					if (user) userCache.set(h.userId, user);
				}
				const u = user as {
					_id: string;
					name: string;
					image?: string;
					username?: string;
				} | null;
				return {
					...h,
					user: u
						? { _id: u._id, name: u.name, image: u.image, username: u.username }
						: null,
				};
			})
		);

		// Manual pagination
		const numItems = args.paginationOpts?.numItems ?? 20;
		const page = hydrated.slice(0, numItems);
		return {
			page,
			isDone: hydrated.length <= numItems,
			continueCursor: "",
		};
	},
});

export const feedBookmarks = query({
	args: { paginationOpts: v.any() },
	handler: async (ctx, args) => {
		const auth = await getAuthenticatedUser(ctx);
		if (!auth) return { page: [], isDone: true, continueCursor: "" };

		const friendIds = await getFriendIds(ctx, auth.userId);
		if (friendIds.length === 0)
			return { page: [], isDone: true, continueCursor: "" };

		const allBookmarks = [];
		for (const friendId of friendIds) {
			// Check friend's bookmark visibility setting
			const friendUser = await ctx.db.get(friendId);
			const bookmarksVisibility = friendUser?.bookmarksVisibility ?? "public";

			if (bookmarksVisibility === "private") continue;

			const bookmarks = await ctx.db
				.query("bookmarks")
				.withIndex("by_userId", (q) => q.eq("userId", friendId))
				.order("desc")
				.take(50);

			for (const b of bookmarks) {
				allBookmarks.push({ ...b, _friendUser: friendUser });
			}
		}

		allBookmarks.sort((a, b) => b._creationTime - a._creationTime);

		const numItems = args.paginationOpts?.numItems ?? 20;
		const page = allBookmarks.slice(0, numItems).map((b) => {
			const { _friendUser, ...bookmark } = b;
			const u = _friendUser as {
				_id: string;
				name: string;
				image?: string;
				username?: string;
			} | null;
			return {
				...bookmark,
				user: u
					? { _id: u._id, name: u.name, image: u.image, username: u.username }
					: null,
			};
		});

		return {
			page,
			isDone: allBookmarks.length <= numItems,
			continueCursor: "",
		};
	},
});
