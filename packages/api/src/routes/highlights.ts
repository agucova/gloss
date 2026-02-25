import { db } from "@gloss/db";
import { highlight, user } from "@gloss/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { deriveAuth } from "../lib/auth";
import { getFriendIds } from "../lib/friends";
import { indexHighlight, removeFromIndex } from "../lib/search-index";
import { hashUrl, normalizeUrl } from "../lib/url";
import {
	CreateHighlightSchema,
	CursorPaginationSchema,
	UpdateHighlightSchema,
} from "../models";

/**
 * Highlights routes.
 * Supports both session and API key authentication.
 */
export const highlights = new Elysia({ prefix: "/highlights" })
	.derive(async ({ request }) => deriveAuth(request))

	// Get highlights for a URL (visibility-filtered based on auth and user preferences)
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

			// Fetch user's display filter preference
			const userSettings = await db.query.user.findFirst({
				where: eq(user.id, session.user.id),
				columns: { highlightDisplayFilter: true },
			});
			const displayFilter = userSettings?.highlightDisplayFilter ?? "friends";

			// "me" filter: only show own highlights
			if (displayFilter === "me") {
				const results = await db.query.highlight.findMany({
					where: and(
						eq(highlight.urlHash, urlHash),
						eq(highlight.userId, session.user.id)
					),
					with: { user: { columns: { id: true, name: true, image: true } } },
					orderBy: [desc(highlight.createdAt)],
				});
				return results;
			}

			// Get friend IDs for "friends" and "anyone" filters
			const friendIds = await getFriendIds(session.user.id);
			const visibleUserIds = [session.user.id, ...friendIds];

			// "friends" filter: only show own + friends' highlights
			if (displayFilter === "friends") {
				const results = await db.query.highlight.findMany({
					where: and(
						eq(highlight.urlHash, urlHash),
						or(
							// Own highlights (any visibility)
							eq(highlight.userId, session.user.id),
							// Friends' highlights with friends or public visibility
							and(
								inArray(highlight.userId, friendIds),
								or(
									eq(highlight.visibility, "public"),
									eq(highlight.visibility, "friends")
								)
							)
						)
					),
					with: { user: { columns: { id: true, name: true, image: true } } },
					orderBy: [desc(highlight.createdAt)],
				});
				return results;
			}

			// "anyone" filter: show public + own + friends' highlights (most permissive)
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

	// Create a new highlight
	.post(
		"/",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const normalizedUrl = normalizeUrl(body.url);
			const urlHash = await hashUrl(normalizedUrl);

			const newHighlight = await db
				.insert(highlight)
				.values({
					id: createId(),
					userId: session.user.id,
					url: normalizedUrl,
					urlHash,
					selector: body.selector,
					text: body.text,
					visibility: body.visibility ?? "friends",
				})
				.returning();

			const created = newHighlight[0];
			if (created) {
				// Index for search (fire-and-forget)
				indexHighlight(created);
			}

			set.status = 201;
			return created;
		},
		{
			body: CreateHighlightSchema,
		}
	)

	// Get own highlights (paginated)
	.get(
		"/mine",
		async ({ query, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const limit = query.limit ?? 20;
			const results = await db.query.highlight.findMany({
				where: eq(highlight.userId, session.user.id),
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

	// Update own highlight
	.patch(
		"/:id",
		async ({ params, body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			// Verify ownership
			const existing = await db.query.highlight.findFirst({
				where: eq(highlight.id, params.id),
			});

			if (!existing) {
				set.status = 404;
				return { error: "Highlight not found" };
			}

			if (existing.userId !== session.user.id) {
				set.status = 403;
				return { error: "Not authorized to update this highlight" };
			}

			const updated = await db
				.update(highlight)
				.set({
					...(body.visibility !== undefined && { visibility: body.visibility }),
				})
				.where(eq(highlight.id, params.id))
				.returning();

			const result = updated[0];
			// Re-index if visibility changed (affects search filtering)
			if (result && body.visibility !== undefined) {
				indexHighlight(result);
			}

			return result;
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
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			// Verify ownership
			const existing = await db.query.highlight.findFirst({
				where: eq(highlight.id, params.id),
			});

			if (!existing) {
				set.status = 404;
				return { error: "Highlight not found" };
			}

			if (existing.userId !== session.user.id) {
				set.status = 403;
				return { error: "Not authorized to delete this highlight" };
			}

			await db.delete(highlight).where(eq(highlight.id, params.id));

			// Remove from search index (fire-and-forget)
			removeFromIndex("highlight", params.id);

			return { success: true };
		},
		{
			params: t.Object({
				id: t.String(),
			}),
		}
	);
