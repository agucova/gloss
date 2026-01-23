import { auth } from "@gloss/auth";
import { db } from "@gloss/db";
import { bookmark, highlight } from "@gloss/db/schema";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Elysia, t } from "elysia";

/**
 * Search routes.
 * Search user's bookmarks and highlights.
 */
export const search = new Elysia({ prefix: "/search" })
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return { session };
	})

	// Search bookmarks and highlights
	.get(
		"/",
		async ({ query, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const { q, limit = 20 } = query;
			const searchPattern = `%${q}%`;

			// Search user's bookmarks
			const bookmarkResults = await db.query.bookmark.findMany({
				where: and(
					eq(bookmark.userId, session.user.id),
					or(
						ilike(bookmark.title, searchPattern),
						ilike(bookmark.url, searchPattern),
						ilike(bookmark.description, searchPattern)
					)
				),
				orderBy: [desc(bookmark.createdAt)],
				limit,
			});

			// Search user's highlights
			const highlightResults = await db.query.highlight.findMany({
				where: and(
					eq(highlight.userId, session.user.id),
					or(
						ilike(highlight.text, searchPattern),
						ilike(highlight.note, searchPattern),
						ilike(highlight.url, searchPattern)
					)
				),
				orderBy: [desc(highlight.createdAt)],
				limit,
			});

			return {
				bookmarks: bookmarkResults,
				highlights: highlightResults,
			};
		},
		{
			query: t.Object({
				q: t.String({ minLength: 1 }),
				limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
			}),
		}
	);
