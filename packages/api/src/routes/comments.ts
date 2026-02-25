import { db } from "@gloss/db";
import { comment, commentMention, highlight } from "@gloss/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { deriveAuth } from "../lib/auth";
import { areFriends, getFriendIds } from "../lib/friends";
import { indexComment, removeFromIndex } from "../lib/search-index";

/**
 * Schema for creating a comment.
 */
const CreateCommentSchema = t.Object({
	highlightId: t.String({ minLength: 1 }),
	content: t.String({ minLength: 1 }),
	mentions: t.Optional(t.Array(t.String())),
	parentId: t.Optional(t.String()),
});

/**
 * Schema for updating a comment.
 */
const UpdateCommentSchema = t.Object({
	content: t.String({ minLength: 1 }),
	mentions: t.Optional(t.Array(t.String())),
});

/**
 * Check if user can view a highlight based on visibility rules.
 */
async function canViewHighlight(
	hl: typeof highlight.$inferSelect,
	userId?: string
): Promise<boolean> {
	if (hl.visibility === "public") {
		return true;
	}
	if (!userId) {
		return false;
	}
	if (hl.userId === userId) {
		return true;
	}
	if (hl.visibility === "friends") {
		return await areFriends(hl.userId, userId);
	}
	return false;
}

/**
 * Check if user can comment on a highlight.
 */
async function canCommentOnHighlight(
	hl: typeof highlight.$inferSelect,
	userId: string
): Promise<boolean> {
	// Owner can always comment
	if (hl.userId === userId) {
		return true;
	}
	// Friends can comment on friends-visible highlights
	if (hl.visibility === "friends") {
		return await areFriends(hl.userId, userId);
	}
	// Anyone authenticated can comment on public highlights
	if (hl.visibility === "public") {
		return true;
	}
	return false;
}

/**
 * Validate that mentioned user IDs are friends (or self).
 */
async function validateMentions(
	mentionIds: string[],
	userId: string
): Promise<string[]> {
	if (mentionIds.length === 0) {
		return [];
	}
	const friendIds = await getFriendIds(userId);
	const validIds = new Set([userId, ...friendIds]);
	return mentionIds.filter((id) => validIds.has(id));
}

/**
 * Comments routes.
 */
export const comments = new Elysia({ prefix: "/comments" })
	.derive(async ({ request }) => deriveAuth(request))

	// Get comments for a highlight
	.get(
		"/highlight/:highlightId",
		async ({ params, session, set }) => {
			// First verify user can see this highlight
			const hl = await db.query.highlight.findFirst({
				where: eq(highlight.id, params.highlightId),
			});

			if (!hl) {
				set.status = 404;
				return { error: "Highlight not found" };
			}

			const canView = await canViewHighlight(hl, session?.user?.id);
			if (!canView) {
				set.status = 403;
				return { error: "Cannot view this highlight" };
			}

			const results = await db.query.comment.findMany({
				where: and(
					eq(comment.highlightId, params.highlightId),
					isNull(comment.deletedAt)
				),
				with: {
					author: { columns: { id: true, name: true, image: true } },
					mentions: {
						with: {
							mentionedUser: { columns: { id: true, name: true } },
						},
					},
				},
				orderBy: [desc(comment.createdAt)],
			});

			return results;
		},
		{
			params: t.Object({ highlightId: t.String() }),
		}
	)

	// Create a comment
	.post(
		"/",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			// Verify highlight exists and user can comment
			const hl = await db.query.highlight.findFirst({
				where: eq(highlight.id, body.highlightId),
			});

			if (!hl) {
				set.status = 404;
				return { error: "Highlight not found" };
			}

			const canComment = await canCommentOnHighlight(hl, session.user.id);
			if (!canComment) {
				set.status = 403;
				return { error: "Cannot comment on this highlight" };
			}

			// If replying to a parent comment, validate it exists and belongs to same highlight
			if (body.parentId) {
				const parentComment = await db.query.comment.findFirst({
					where: and(eq(comment.id, body.parentId), isNull(comment.deletedAt)),
				});

				if (!parentComment) {
					set.status = 404;
					return { error: "Parent comment not found" };
				}

				if (parentComment.highlightId !== body.highlightId) {
					set.status = 400;
					return { error: "Parent comment belongs to different highlight" };
				}
			}

			// Validate mentioned users are friends (or self)
			const validMentions = await validateMentions(
				body.mentions ?? [],
				session.user.id
			);

			const commentId = createId();

			// Insert comment
			await db.insert(comment).values({
				id: commentId,
				highlightId: body.highlightId,
				authorId: session.user.id,
				content: body.content,
				parentId: body.parentId ?? null,
			});

			// Insert mentions
			if (validMentions.length > 0) {
				await db.insert(commentMention).values(
					validMentions.map((userId) => ({
						id: createId(),
						commentId,
						mentionedUserId: userId,
					}))
				);
			}

			// Return comment with author info
			const result = await db.query.comment.findFirst({
				where: eq(comment.id, commentId),
				with: {
					author: { columns: { id: true, name: true, image: true } },
					mentions: {
						with: {
							mentionedUser: { columns: { id: true, name: true } },
						},
					},
				},
			});

			// Index for search (fire-and-forget)
			if (result) {
				indexComment(
					{ id: commentId, authorId: session.user.id, content: body.content },
					hl.visibility,
					hl.url
				);
			}

			set.status = 201;
			return result;
		},
		{ body: CreateCommentSchema }
	)

	// Update own comment
	.patch(
		"/:id",
		async ({ params, body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const existing = await db.query.comment.findFirst({
				where: eq(comment.id, params.id),
			});

			if (!existing || existing.deletedAt) {
				set.status = 404;
				return { error: "Comment not found" };
			}

			if (existing.authorId !== session.user.id) {
				set.status = 403;
				return { error: "Not authorized to edit this comment" };
			}

			// Update mentions: delete old, insert new
			await db
				.delete(commentMention)
				.where(eq(commentMention.commentId, params.id));

			const validMentions = await validateMentions(
				body.mentions ?? [],
				session.user.id
			);

			if (validMentions.length > 0) {
				await db.insert(commentMention).values(
					validMentions.map((userId) => ({
						id: createId(),
						commentId: params.id,
						mentionedUserId: userId,
					}))
				);
			}

			await db
				.update(comment)
				.set({ content: body.content })
				.where(eq(comment.id, params.id));

			// Return updated comment
			const result = await db.query.comment.findFirst({
				where: eq(comment.id, params.id),
				with: {
					author: { columns: { id: true, name: true, image: true } },
					mentions: {
						with: {
							mentionedUser: { columns: { id: true, name: true } },
						},
					},
				},
			});

			// Re-index for search (fire-and-forget)
			if (result) {
				const hl = await db.query.highlight.findFirst({
					where: eq(highlight.id, existing.highlightId),
				});
				if (hl) {
					indexComment(
						{ id: params.id, authorId: session.user.id, content: body.content },
						hl.visibility,
						hl.url
					);
				}
			}

			return result;
		},
		{
			params: t.Object({ id: t.String() }),
			body: UpdateCommentSchema,
		}
	)

	// Delete comment (soft delete) - allowed for comment author or highlight owner
	.delete(
		"/:id",
		async ({ params, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const existing = await db.query.comment.findFirst({
				where: eq(comment.id, params.id),
			});

			if (!existing || existing.deletedAt) {
				set.status = 404;
				return { error: "Comment not found" };
			}

			// Allow deletion by comment author OR highlight owner
			const hl = await db.query.highlight.findFirst({
				where: eq(highlight.id, existing.highlightId),
			});

			if (
				existing.authorId !== session.user.id &&
				hl?.userId !== session.user.id
			) {
				set.status = 403;
				return { error: "Not authorized to delete this comment" };
			}

			await db
				.update(comment)
				.set({ deletedAt: new Date() })
				.where(eq(comment.id, params.id));

			// Remove from search index (fire-and-forget)
			removeFromIndex("comment", params.id);

			return { success: true };
		},
		{ params: t.Object({ id: t.String() }) }
	);
