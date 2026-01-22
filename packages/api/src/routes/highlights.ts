import { and, db, desc, eq, inArray, or } from "@gloss/db";
import { highlight } from "@gloss/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { Elysia, t } from "elysia";
import { authPlugin, protectedPlugin } from "../lib/auth";
import { getFriendIds } from "../lib/friends";
import { hashUrl, normalizeUrl } from "../lib/url";
import {
	CreateHighlightSchema,
	CursorPaginationSchema,
	UpdateHighlightSchema,
} from "../models";

/**
 * Highlights routes.
 */
export const highlights = new Elysia({ prefix: "/highlights" })
	.use(authPlugin)

	// Get highlights for a URL (visibility-filtered based on auth)
	.get(
		"/",
		async ({ query, session }) => {
			const normalizedUrl = normalizeUrl(query.url);
			const urlHash = await hashUrl(normalizedUrl);

			// Build visibility filter based on authentication
			if (!session) {
				// Unauthenticated: only show public highlights
				const results = await db.query.highlight.findMany({
					where: and(
						eq(highlight.urlHash, urlHash),
						eq(highlight.visibility, "public")
					),
					with: { user: { columns: { id: true, name: true, image: true } } },
					orderBy: [desc(highlight.createdAt)],
				});
				return results;
			}

			// Authenticated: show public, own, and friends' highlights
			const friendIds = await getFriendIds(session.user.id);
			const visibleUserIds = [session.user.id, ...friendIds];

			const results = await db.query.highlight.findMany({
				where: and(
					eq(highlight.urlHash, urlHash),
					or(
						eq(highlight.visibility, "public"),
						// Own highlights (any visibility)
						eq(highlight.userId, session.user.id),
						// Friends' highlights with friends visibility
						and(
							eq(highlight.visibility, "friends"),
							inArray(highlight.userId, visibleUserIds)
						)
					)
				),
				with: { user: { columns: { id: true, name: true, image: true } } },
				orderBy: [desc(highlight.createdAt)],
			});
			return results;
		},
		{
			query: t.Object({
				url: t.String({ format: "uri" }),
			}),
		}
	)

	// Protected routes below
	.use(protectedPlugin)

	// Create a new highlight
	.post(
		"/",
		async ({ body, session, set }) => {
			const normalizedUrl = normalizeUrl(body.url);
			const urlHash = await hashUrl(normalizedUrl);

			const newHighlight = await db
				.insert(highlight)
				.values({
					id: createId(),
					userId: session!.user.id,
					url: normalizedUrl,
					urlHash,
					selector: body.selector,
					text: body.text,
					note: body.note ?? null,
					color: body.color ?? "#FFFF00",
					visibility: body.visibility ?? "friends",
				})
				.returning();

			set.status = 201;
			return newHighlight[0];
		},
		{
			body: CreateHighlightSchema,
		}
	)

	// Get own highlights (paginated)
	.get(
		"/mine",
		async ({ query, session }) => {
			const limit = query.limit ?? 20;
			const results = await db.query.highlight.findMany({
				where: eq(highlight.userId, session!.user.id),
				orderBy: [desc(highlight.createdAt)],
				limit: limit + 1, // Fetch one extra to check if there's more
				...(query.cursor && {
					where: and(
						eq(highlight.userId, session!.user.id)
						// Cursor is the createdAt timestamp
						// We need to fetch highlights older than the cursor
					),
				}),
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

	// Update own highlight
	.patch(
		"/:id",
		async ({ params, body, session, set }) => {
			// Verify ownership
			const existing = await db.query.highlight.findFirst({
				where: eq(highlight.id, params.id),
			});

			if (!existing) {
				set.status = 404;
				return { error: "Highlight not found" };
			}

			if (existing.userId !== session!.user.id) {
				set.status = 403;
				return { error: "Not authorized to update this highlight" };
			}

			const updated = await db
				.update(highlight)
				.set({
					...(body.note !== undefined && { note: body.note }),
					...(body.color !== undefined && { color: body.color }),
					...(body.visibility !== undefined && { visibility: body.visibility }),
				})
				.where(eq(highlight.id, params.id))
				.returning();

			return updated[0];
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			body: UpdateHighlightSchema,
		}
	)

	// Delete own highlight
	.delete(
		"/:id",
		async ({ params, session, set }) => {
			// Verify ownership
			const existing = await db.query.highlight.findFirst({
				where: eq(highlight.id, params.id),
			});

			if (!existing) {
				set.status = 404;
				return { error: "Highlight not found" };
			}

			if (existing.userId !== session!.user.id) {
				set.status = 403;
				return { error: "Not authorized to delete this highlight" };
			}

			await db.delete(highlight).where(eq(highlight.id, params.id));

			return { success: true };
		},
		{
			params: t.Object({
				id: t.String(),
			}),
		}
	);
