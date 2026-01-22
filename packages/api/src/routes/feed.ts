import { and, db, desc, eq, inArray, lt, or } from "@gloss/db";
import { highlight } from "@gloss/db/schema";
import { Elysia } from "elysia";
import { protectedPlugin } from "../lib/auth";
import { getFriendIds } from "../lib/friends";
import { CursorPaginationSchema } from "../models";

/**
 * Feed routes.
 * Shows friends' recent highlights.
 */
export const feed = new Elysia({ prefix: "/feed" })
	.use(protectedPlugin)

	// Get friends' recent highlights (paginated)
	.get(
		"/",
		async ({ query, session }) => {
			const limit = query.limit ?? 20;
			const friendIds = await getFriendIds(session!.user.id);

			if (friendIds.length === 0) {
				return {
					items: [],
					nextCursor: null,
				};
			}

			// Build cursor condition
			let cursorCondition;
			if (query.cursor) {
				const cursorDate = new Date(query.cursor);
				cursorCondition = lt(highlight.createdAt, cursorDate);
			}

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
	);
