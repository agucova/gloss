import { db } from "@gloss/db";
import { bookmark, highlight } from "@gloss/db/schema";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { Elysia } from "elysia";

import { deriveAuth } from "../lib/auth";
import { getFriendIds } from "../lib/friends";
import { CursorPaginationSchema } from "../models";

/**
 * Feed routes.
 * Shows friends' recent activity (highlights and bookmarks).
 */
export const feed = new Elysia({ prefix: "/feed" })
	// Derive session for all feed routes
	.derive(async ({ request }) => deriveAuth(request))

	// Get friends' recent highlights (paginated)
	.get(
		"/",
		async ({ query, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const limit = query.limit ?? 20;
			const friendIds = await getFriendIds(session.user.id);

			if (friendIds.length === 0) {
				return {
					items: [],
					nextCursor: null,
				};
			}

			// Build cursor condition
			const cursorCondition = query.cursor
				? lt(highlight.createdAt, new Date(query.cursor))
				: undefined;

			const results = await db.query.highlight.findMany({
				where: and(
					// Only friends' highlights
					inArray(highlight.userId, friendIds),
					// Only friends or public visibility
					or(
						eq(highlight.visibility, "friends"),
						eq(highlight.visibility, "public")
					),
					cursorCondition
				),
				with: {
					user: { columns: { id: true, name: true, image: true } },
				},
				orderBy: [desc(highlight.createdAt)],
				limit: limit + 1,
			});

			const hasMore = results.length > limit;
			const items = hasMore ? results.slice(0, -1) : results;
			const nextCursor = hasMore ? items.at(-1)?.createdAt.toISOString() : null;

			return {
				items,
				nextCursor,
			};
		},
		{
			query: CursorPaginationSchema,
		}
	)

	// Get friends' recent bookmarks (paginated)
	.get(
		"/bookmarks",
		async ({ query, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const limit = query.limit ?? 20;
			const friendIds = await getFriendIds(session.user.id);

			if (friendIds.length === 0) {
				return {
					items: [],
					nextCursor: null,
				};
			}

			// Build cursor condition
			const cursorCondition = query.cursor
				? lt(bookmark.createdAt, new Date(query.cursor))
				: undefined;

			const results = await db.query.bookmark.findMany({
				where: and(inArray(bookmark.userId, friendIds), cursorCondition),
				with: {
					user: { columns: { id: true, name: true, image: true } },
				},
				orderBy: [desc(bookmark.createdAt)],
				limit: limit + 1,
			});

			const hasMore = results.length > limit;
			const items = hasMore ? results.slice(0, -1) : results;
			const nextCursor = hasMore ? items.at(-1)?.createdAt.toISOString() : null;

			return {
				items,
				nextCursor,
			};
		},
		{
			query: CursorPaginationSchema,
		}
	);
