import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";

import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser, requireAuth } from "./lib/auth";
import { softDeleteComment } from "./lib/cascade";
import { areFriends, getFriendIds } from "./lib/friends";

export const getForHighlight = query({
	args: { highlightId: v.id("highlights") },
	handler: async (ctx, args) => {
		const auth = await getAuthenticatedUser(ctx);

		// Check highlight visibility
		const highlight = await ctx.db.get(args.highlightId);
		if (!highlight) return [];

		// Visibility check
		if (highlight.visibility === "private") {
			if (!auth || highlight.userId !== auth.userId) return [];
		} else if (highlight.visibility === "friends") {
			if (!auth) return [];
			if (
				highlight.userId !== auth.userId &&
				!(await areFriends(ctx, auth.userId, highlight.userId))
			)
				return [];
		}

		const comments = await ctx.db
			.query("comments")
			.withIndex("by_highlightId", (q) => q.eq("highlightId", args.highlightId))
			.order("asc")
			.collect();

		// Filter out soft-deleted
		const activeComments = comments.filter((c) => !c.deletedAt);

		// Hydrate with author info and mentions
		return Promise.all(
			activeComments.map(async (comment) => {
				const author = await ctx.db.get(comment.authorId);
				const mentions = await ctx.db
					.query("commentMentions")
					.withIndex("by_commentId", (q) => q.eq("commentId", comment._id))
					.collect();
				const mentionedUsers = await Promise.all(
					mentions.map(async (m) => {
						const user = await ctx.db.get(m.mentionedUserId);
						return user
							? {
									_id: user._id,
									name: user.name,
									username: user.username,
								}
							: null;
					})
				);

				return {
					...comment,
					author: author
						? {
								_id: author._id,
								name: author.name,
								image: author.image,
								username: author.username,
							}
						: null,
					mentions: mentionedUsers.filter(Boolean),
				};
			})
		);
	},
});

export const create = mutation({
	args: {
		highlightId: v.id("highlights"),
		content: v.string(),
		parentId: v.optional(v.id("comments")),
		mentionedUserIds: v.optional(v.array(v.id("users"))),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);

		const highlight = await ctx.db.get(args.highlightId);
		if (!highlight) throw new Error("Highlight not found");

		// Authorization: can this user comment?
		if (highlight.userId !== userId) {
			if (highlight.visibility === "private")
				throw new Error("Cannot comment on private highlight");
			if (highlight.visibility === "friends") {
				if (!(await areFriends(ctx, userId, highlight.userId)))
					throw new Error("Cannot comment on this highlight");
			}
		}

		// Validate parent comment
		if (args.parentId) {
			const parent = await ctx.db.get(args.parentId);
			if (!parent || parent.highlightId !== args.highlightId)
				throw new Error("Invalid parent comment");
		}

		// Validate mentions (self + friends only)
		const friendIds = await getFriendIds(ctx, userId);
		const validMentionIds = new Set([userId, ...friendIds]);
		const mentionedUserIds = (args.mentionedUserIds ?? []).filter((id) =>
			validMentionIds.has(id)
		);

		const commentId = await ctx.db.insert("comments", {
			highlightId: args.highlightId,
			authorId: userId,
			parentId: args.parentId,
			content: args.content,
			searchContent: args.content,
		});

		// Insert mentions
		for (const mentionedUserId of mentionedUserIds) {
			await ctx.db.insert("commentMentions", {
				commentId,
				mentionedUserId,
			});
		}

		return commentId;
	},
});

export const update = mutation({
	args: {
		id: v.id("comments"),
		content: v.string(),
		mentionedUserIds: v.optional(v.array(v.id("users"))),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const comment = await ctx.db.get(args.id);
		if (!comment) throw new Error("Comment not found");
		if (comment.authorId !== userId)
			throw new Error("Not authorized to edit this comment");

		await ctx.db.patch(args.id, {
			content: args.content,
			searchContent: args.content,
			updatedAt: Date.now(),
		});

		// Re-sync mentions
		if (args.mentionedUserIds !== undefined) {
			const existingMentions = await ctx.db
				.query("commentMentions")
				.withIndex("by_commentId", (q) => q.eq("commentId", args.id))
				.collect();
			for (const m of existingMentions) {
				await ctx.db.delete(m._id);
			}

			const friendIds = await getFriendIds(ctx, userId);
			const validMentionIds = new Set([userId, ...friendIds]);
			for (const mentionedUserId of args.mentionedUserIds) {
				if (validMentionIds.has(mentionedUserId)) {
					await ctx.db.insert("commentMentions", {
						commentId: args.id,
						mentionedUserId,
					});
				}
			}
		}

		return args.id;
	},
});

export const remove = mutation({
	args: { id: v.id("comments") },
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const comment = await ctx.db.get(args.id);
		if (!comment) throw new Error("Comment not found");

		// Author or highlight owner can delete
		const highlight = await ctx.db.get(comment.highlightId);
		if (comment.authorId !== userId && highlight?.userId !== userId)
			throw new Error("Not authorized to delete this comment");

		await softDeleteComment(ctx, args.id);
		return { success: true };
	},
});
