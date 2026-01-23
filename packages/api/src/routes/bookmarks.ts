import { db } from "@gloss/db";
import { bookmark, bookmarkTag, tag } from "@gloss/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { deriveAuth } from "../lib/auth";
import { indexBookmark, removeFromIndex } from "../lib/search-index";
import {
	isSystemTagName,
	SYSTEM_TAGS,
	type SystemTagName,
} from "../lib/system-tags";
import { hashUrl, normalizeUrl } from "../lib/url";
import { CreateBookmarkSchema, CursorPaginationSchema } from "../models";

/** Tag record returned from queries */
export interface TagRecord {
	id: string;
	name: string;
	color: string | null;
	isSystem: boolean;
}

/**
 * Normalize tag name for consistent storage.
 */
function normalizeTagName(name: string): string {
	return name.trim().toLowerCase();
}

/**
 * Get or create tags for a user, returning the tag records.
 * System tags (favorites, to-read) get special handling.
 */
async function getOrCreateTags(
	userId: string,
	tagNames: string[]
): Promise<TagRecord[]> {
	if (tagNames.length === 0) {
		return [];
	}

	const normalizedNames = tagNames.map(normalizeTagName);
	const uniqueNames = [...new Set(normalizedNames)];

	// Find existing tags
	const existingTags = await db.query.tag.findMany({
		where: and(eq(tag.userId, userId), inArray(tag.name, uniqueNames)),
	});

	const existingNames = new Set(existingTags.map((t) => t.name));
	const newNames = uniqueNames.filter((name) => !existingNames.has(name));

	// Create missing tags (with system flag for known system tags)
	if (newNames.length > 0) {
		await db.insert(tag).values(
			newNames.map((name) => ({
				id: createId(),
				userId,
				name,
				isSystem: isSystemTagName(name),
				color: isSystemTagName(name)
					? SYSTEM_TAGS[name as SystemTagName].color
					: null,
			}))
		);
	}

	// Return all tags (existing + newly created)
	return db.query.tag.findMany({
		where: and(eq(tag.userId, userId), inArray(tag.name, uniqueNames)),
		columns: { id: true, name: true, color: true, isSystem: true },
	});
}

/**
 * Sync bookmark tags: remove old associations, add new ones.
 */
async function syncBookmarkTags(
	bookmarkId: string,
	tagIds: string[]
): Promise<void> {
	// Delete existing associations
	await db.delete(bookmarkTag).where(eq(bookmarkTag.bookmarkId, bookmarkId));

	// Create new associations
	if (tagIds.length > 0) {
		await db.insert(bookmarkTag).values(
			tagIds.map((tagId) => ({
				id: createId(),
				bookmarkId,
				tagId,
			}))
		);
	}
}

/**
 * Get tags for a bookmark.
 */
async function getBookmarkTags(bookmarkId: string): Promise<TagRecord[]> {
	const associations = await db.query.bookmarkTag.findMany({
		where: eq(bookmarkTag.bookmarkId, bookmarkId),
		with: {
			tag: { columns: { id: true, name: true, color: true, isSystem: true } },
		},
	});
	return associations.map((a) => a.tag);
}

/**
 * Toggle a system tag on a bookmark (add if missing, remove if present).
 */
async function toggleSystemTag(
	userId: string,
	bookmarkId: string,
	tagName: SystemTagName
): Promise<{ added: boolean }> {
	// Get or create the system tag
	const [systemTag] = await getOrCreateTags(userId, [tagName]);
	if (!systemTag) {
		throw new Error(`Failed to get or create system tag: ${tagName}`);
	}

	// Check if bookmark already has this tag
	const existing = await db.query.bookmarkTag.findFirst({
		where: and(
			eq(bookmarkTag.bookmarkId, bookmarkId),
			eq(bookmarkTag.tagId, systemTag.id)
		),
	});

	if (existing) {
		// Remove the tag
		await db.delete(bookmarkTag).where(eq(bookmarkTag.id, existing.id));
		return { added: false };
	}

	// Add the tag
	await db.insert(bookmarkTag).values({
		id: createId(),
		bookmarkId,
		tagId: systemTag.id,
	});
	return { added: true };
}

/**
 * Bookmarks routes.
 * Supports both session and API key authentication.
 */
export const bookmarks = new Elysia({ prefix: "/bookmarks" })
	.derive(async ({ request }) => deriveAuth(request))

	// Create a bookmark
	.post(
		"/",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const normalizedUrl = normalizeUrl(body.url);
			const urlHash = await hashUrl(normalizedUrl);

			// Check if already bookmarked
			const existing = await db.query.bookmark.findFirst({
				where: and(
					eq(bookmark.userId, session.user.id),
					eq(bookmark.urlHash, urlHash)
				),
			});

			if (existing) {
				const tags = await getBookmarkTags(existing.id);
				set.status = 409;
				return {
					error: "URL already bookmarked",
					bookmark: { ...existing, tags },
				};
			}

			const [newBookmark] = await db
				.insert(bookmark)
				.values({
					id: createId(),
					userId: session.user.id,
					url: normalizedUrl,
					urlHash,
					title: body.title ?? null,
					description: body.description ?? null,
					favicon: body.favicon ?? null,
					ogImage: body.ogImage ?? null,
					ogDescription: body.ogDescription ?? null,
					siteName: body.siteName ?? null,
				})
				.returning();

			if (!newBookmark) {
				set.status = 500;
				return { error: "Failed to create bookmark" };
			}

			// Handle tags
			let tags: TagRecord[] = [];
			if (body.tags && body.tags.length > 0) {
				tags = await getOrCreateTags(session.user.id, body.tags);
				await syncBookmarkTags(
					newBookmark.id,
					tags.map((t) => t.id)
				);
			}

			// Index for search (fire-and-forget)
			indexBookmark(newBookmark);

			set.status = 201;
			return { ...newBookmark, tags };
		},
		{
			body: CreateBookmarkSchema,
		}
	)

	// Delete a bookmark
	.delete(
		"/:id",
		async ({ params, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const existing = await db.query.bookmark.findFirst({
				where: eq(bookmark.id, params.id),
			});

			if (!existing) {
				set.status = 404;
				return { error: "Bookmark not found" };
			}

			if (existing.userId !== session.user.id) {
				set.status = 403;
				return { error: "Not authorized to delete this bookmark" };
			}

			await db.delete(bookmark).where(eq(bookmark.id, params.id));

			// Remove from search index (fire-and-forget)
			removeFromIndex("bookmark", params.id);

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
		async ({ query, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const limit = query.limit ?? 20;
			const results = await db.query.bookmark.findMany({
				where: eq(bookmark.userId, session.user.id),
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
	)

	// Check if URL is bookmarked
	.get(
		"/check",
		async ({ query, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const normalizedUrl = normalizeUrl(query.url);
			const urlHash = await hashUrl(normalizedUrl);

			const existing = await db.query.bookmark.findFirst({
				where: and(
					eq(bookmark.userId, session.user.id),
					eq(bookmark.urlHash, urlHash)
				),
			});

			if (!existing) {
				return { bookmarked: false, bookmark: null };
			}

			const tags = await getBookmarkTags(existing.id);
			return {
				bookmarked: true,
				bookmark: { ...existing, tags },
			};
		},
		{
			query: t.Object({
				url: t.String({ format: "uri" }),
			}),
		}
	)

	// Update a bookmark (tags, title, description)
	.patch(
		"/:id",
		async ({ params, body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const existing = await db.query.bookmark.findFirst({
				where: eq(bookmark.id, params.id),
			});

			if (!existing) {
				set.status = 404;
				return { error: "Bookmark not found" };
			}

			if (existing.userId !== session.user.id) {
				set.status = 403;
				return { error: "Not authorized to update this bookmark" };
			}

			// Update bookmark fields if provided
			const updates: Partial<typeof bookmark.$inferInsert> = {};
			if (body.title !== undefined) {
				updates.title = body.title;
			}
			if (body.description !== undefined) {
				updates.description = body.description;
			}

			if (Object.keys(updates).length > 0) {
				await db
					.update(bookmark)
					.set(updates)
					.where(eq(bookmark.id, params.id));
			}

			// Update tags if provided
			let tags: TagRecord[] = [];
			if (body.tags !== undefined) {
				if (body.tags.length > 0) {
					tags = await getOrCreateTags(session.user.id, body.tags);
					await syncBookmarkTags(
						params.id,
						tags.map((t) => t.id)
					);
				} else {
					await syncBookmarkTags(params.id, []);
				}
			} else {
				tags = await getBookmarkTags(params.id);
			}

			const updated = await db.query.bookmark.findFirst({
				where: eq(bookmark.id, params.id),
			});

			// Re-index for search if content changed (fire-and-forget)
			if (
				updated &&
				(body.title !== undefined || body.description !== undefined)
			) {
				indexBookmark(updated);
			}

			return { ...updated, tags };
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Object({
				title: t.Optional(t.String()),
				description: t.Optional(t.String()),
				tags: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 50 }))),
			}),
		}
	)

	// List user's tags (for autocomplete)
	.get(
		"/tags",
		async ({ query, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const limit = query.limit ?? 50;

			// Get user's tags ordered by most recently created
			const userTags = await db.query.tag.findMany({
				where: eq(tag.userId, session.user.id),
				columns: { id: true, name: true, color: true, isSystem: true },
				orderBy: [desc(tag.createdAt)],
				limit,
			});

			return { tags: userTags };
		},
		{
			query: t.Object({
				limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 50 })),
			}),
		}
	)

	// Toggle favorite status on a bookmark
	.post(
		"/:id/favorite",
		async ({ params, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const existing = await db.query.bookmark.findFirst({
				where: eq(bookmark.id, params.id),
			});

			if (!existing) {
				set.status = 404;
				return { error: "Bookmark not found" };
			}

			if (existing.userId !== session.user.id) {
				set.status = 403;
				return { error: "Not authorized to modify this bookmark" };
			}

			const { added } = await toggleSystemTag(
				session.user.id,
				params.id,
				"favorites"
			);

			return { favorited: added };
		},
		{
			params: t.Object({ id: t.String() }),
		}
	)

	// Toggle to-read status on a bookmark
	.post(
		"/:id/to-read",
		async ({ params, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const existing = await db.query.bookmark.findFirst({
				where: eq(bookmark.id, params.id),
			});

			if (!existing) {
				set.status = 404;
				return { error: "Bookmark not found" };
			}

			if (existing.userId !== session.user.id) {
				set.status = 403;
				return { error: "Not authorized to modify this bookmark" };
			}

			const { added } = await toggleSystemTag(
				session.user.id,
				params.id,
				"to-read"
			);

			return { toRead: added };
		},
		{
			params: t.Object({ id: t.String() }),
		}
	);
