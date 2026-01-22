import { and, db, desc, eq } from "@gloss/db";
import { bookmark } from "@gloss/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { Elysia, t } from "elysia";
import { protectedPlugin } from "../lib/auth";
import { hashUrl, normalizeUrl } from "../lib/url";
import { CreateBookmarkSchema, CursorPaginationSchema } from "../models";

/**
 * Bookmarks routes.
 * All routes require authentication.
 */
export const bookmarks = new Elysia({ prefix: "/bookmarks" })
	.use(protectedPlugin)

	// Create a bookmark
	.post(
		"/",
		async ({ body, session, set }) => {
			const normalizedUrl = normalizeUrl(body.url);
			const urlHash = await hashUrl(normalizedUrl);

			// Check if already bookmarked
			const existing = await db.query.bookmark.findFirst({
				where: and(
					eq(bookmark.userId, session!.user.id),
					eq(bookmark.urlHash, urlHash)
				),
			});

			if (existing) {
				set.status = 409;
				return { error: "URL already bookmarked", bookmark: existing };
			}

			const newBookmark = await db
				.insert(bookmark)
				.values({
					id: createId(),
					userId: session!.user.id,
					url: normalizedUrl,
					urlHash,
					title: body.title ?? null,
					description: body.description ?? null,
				})
				.returning();

			set.status = 201;
			return newBookmark[0];
		},
		{
			body: CreateBookmarkSchema,
		}
	)

	// Delete a bookmark
	.delete(
		"/:id",
		async ({ params, session, set }) => {
			const existing = await db.query.bookmark.findFirst({
				where: eq(bookmark.id, params.id),
			});

			if (!existing) {
				set.status = 404;
				return { error: "Bookmark not found" };
			}

			if (existing.userId !== session!.user.id) {
				set.status = 403;
				return { error: "Not authorized to delete this bookmark" };
			}

			await db.delete(bookmark).where(eq(bookmark.id, params.id));

			return { success: true };
		},
		{
			params: t.Object({
				id: t.String(),
			}),
		}
	)

	// List bookmarks (paginated)
	.get(
		"/",
		async ({ query, session }) => {
			const limit = query.limit ?? 20;
			const results = await db.query.bookmark.findMany({
				where: eq(bookmark.userId, session!.user.id),
				orderBy: [desc(bookmark.createdAt)],
				limit: limit + 1,
			});

			const hasMore = results.length > limit;
			const items = hasMore ? results.slice(0, -1) : results;
			const nextCursor = hasMore
				? items[items.length - 1]?.createdAt.toISOString()
				: null;

			return {
				items,
				nextCursor,
			};
		},
		{
			query: CursorPaginationSchema,
		}
	)

	// Check if URL is bookmarked
	.get(
		"/check",
		async ({ query, session }) => {
			const normalizedUrl = normalizeUrl(query.url);
			const urlHash = await hashUrl(normalizedUrl);

			const existing = await db.query.bookmark.findFirst({
				where: and(
					eq(bookmark.userId, session!.user.id),
					eq(bookmark.urlHash, urlHash)
				),
			});

			return {
				bookmarked: existing !== undefined,
				bookmark: existing ?? null,
			};
		},
		{
			query: t.Object({
				url: t.String({ format: "uri" }),
			}),
		}
	);
