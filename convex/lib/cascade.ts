import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Cascade delete a highlight and all its comments + comment mentions.
 */
export async function cascadeDeleteHighlight(
	ctx: MutationCtx,
	highlightId: Id<"highlights">
) {
	// Delete comment mentions for all comments on this highlight
	const comments = await ctx.db
		.query("comments")
		.withIndex("by_highlightId", (q) => q.eq("highlightId", highlightId))
		.collect();

	for (const comment of comments) {
		const mentions = await ctx.db
			.query("commentMentions")
			.withIndex("by_commentId", (q) => q.eq("commentId", comment._id))
			.collect();
		for (const mention of mentions) {
			await ctx.db.delete(mention._id);
		}
		await ctx.db.delete(comment._id);
	}

	await ctx.db.delete(highlightId);
}

/**
 * Cascade delete a bookmark and its tag associations.
 */
export async function cascadeDeleteBookmark(
	ctx: MutationCtx,
	bookmarkId: Id<"bookmarks">
) {
	const bookmarkTags = await ctx.db
		.query("bookmarkTags")
		.withIndex("by_bookmarkId", (q) => q.eq("bookmarkId", bookmarkId))
		.collect();
	for (const bt of bookmarkTags) {
		await ctx.db.delete(bt._id);
	}
	await ctx.db.delete(bookmarkId);
}

/**
 * Soft-delete a comment: set deletedAt and remove mentions.
 */
export async function softDeleteComment(
	ctx: MutationCtx,
	commentId: Id<"comments">
) {
	const mentions = await ctx.db
		.query("commentMentions")
		.withIndex("by_commentId", (q) => q.eq("commentId", commentId))
		.collect();
	for (const mention of mentions) {
		await ctx.db.delete(mention._id);
	}
	await ctx.db.patch(commentId, { deletedAt: Date.now() });
}

/**
 * Cascade delete all data for a user.
 */
export async function cascadeDeleteUser(ctx: MutationCtx, userId: Id<"users">) {
	// Delete highlights (cascades to comments + mentions)
	const highlights = await ctx.db
		.query("highlights")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.collect();
	for (const h of highlights) {
		await cascadeDeleteHighlight(ctx, h._id);
	}

	// Delete bookmarks (cascades to bookmark tags)
	const bookmarks = await ctx.db
		.query("bookmarks")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.collect();
	for (const b of bookmarks) {
		await cascadeDeleteBookmark(ctx, b._id);
	}

	// Delete tags
	const tags = await ctx.db
		.query("tags")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.collect();
	for (const t of tags) {
		await ctx.db.delete(t._id);
	}

	// Delete friendships (both directions)
	const asRequester = await ctx.db
		.query("friendships")
		.withIndex("by_requesterId", (q) => q.eq("requesterId", userId))
		.collect();
	for (const f of asRequester) {
		await ctx.db.delete(f._id);
	}
	const asAddressee = await ctx.db
		.query("friendships")
		.withIndex("by_addresseeId", (q) => q.eq("addresseeId", userId))
		.collect();
	for (const f of asAddressee) {
		await ctx.db.delete(f._id);
	}

	// Delete API keys
	const apiKeys = await ctx.db
		.query("apiKeys")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.collect();
	for (const k of apiKeys) {
		await ctx.db.delete(k._id);
	}

	// Delete curius credentials
	const curiusCreds = await ctx.db
		.query("curiusCredentials")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.collect();
	for (const c of curiusCreds) {
		await ctx.db.delete(c._id);
	}

	// Delete comments authored by this user
	const authoredComments = await ctx.db
		.query("comments")
		.withIndex("by_authorId", (q) => q.eq("authorId", userId))
		.collect();
	for (const c of authoredComments) {
		await softDeleteComment(ctx, c._id);
	}

	// Delete comment mentions of this user
	const mentionsOfUser = await ctx.db
		.query("commentMentions")
		.withIndex("by_mentionedUserId", (q) => q.eq("mentionedUserId", userId))
		.collect();
	for (const m of mentionsOfUser) {
		await ctx.db.delete(m._id);
	}

	// Delete the user
	await ctx.db.delete(userId);
}
