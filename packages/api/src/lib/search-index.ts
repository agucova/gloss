import { db } from "@gloss/db";
import { searchIndex } from "@gloss/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, sql } from "drizzle-orm";

import { generateEmbedding } from "./embeddings";

/**
 * Entity types that can be indexed.
 */
export type SearchEntityType = "bookmark" | "highlight" | "comment";

/**
 * Visibility options for indexed content.
 */
export type SearchVisibility = "private" | "friends" | "public";

/**
 * Parameters for indexing content.
 */
export interface IndexContentParams {
	entityType: SearchEntityType;
	entityId: string;
	userId: string;
	content: string;
	url?: string | null;
	visibility?: SearchVisibility | null;
}

/**
 * Build searchable content for a bookmark.
 */
export function buildBookmarkContent(bookmark: {
	title?: string | null;
	description?: string | null;
	url: string;
	siteName?: string | null;
}): string {
	const parts: string[] = [];
	if (bookmark.title) {
		parts.push(bookmark.title);
	}
	if (bookmark.description) {
		parts.push(bookmark.description);
	}
	if (bookmark.siteName) {
		parts.push(bookmark.siteName);
	}
	// Include the domain for searchability
	try {
		const domain = new URL(bookmark.url).hostname.replace("www.", "");
		parts.push(domain);
	} catch {
		// Invalid URL, skip domain
	}
	return parts.join(" ").trim();
}

/**
 * Build searchable content for a highlight.
 */
export function buildHighlightContent(highlight: {
	text: string;
	url: string;
}): string {
	const parts = [highlight.text];
	try {
		const domain = new URL(highlight.url).hostname.replace("www.", "");
		parts.push(domain);
	} catch {
		// Invalid URL, skip domain
	}
	return parts.join(" ").trim();
}

/**
 * Build searchable content for a comment.
 */
export function buildCommentContent(comment: { content: string }): string {
	return comment.content.trim();
}

/**
 * Index content for search.
 * Updates existing index entry or creates a new one.
 * Generates embedding asynchronously (fire-and-forget if immediate=false).
 */
export async function indexContent(
	params: IndexContentParams,
	options: { immediate?: boolean } = {}
): Promise<void> {
	const { entityType, entityId, userId, content, url, visibility } = params;
	const { immediate = false } = options;

	// Check if entry already exists
	const existing = await db.query.searchIndex.findFirst({
		where: and(
			eq(searchIndex.entityType, entityType),
			eq(searchIndex.entityId, entityId)
		),
	});

	// Generate tsvector using PostgreSQL's to_tsvector function
	const tsvectorSql = sql`to_tsvector('english', ${content})`;

	if (existing) {
		// Update existing entry
		await db
			.update(searchIndex)
			.set({
				content,
				contentTsv: tsvectorSql,
				url,
				visibility,
				updatedAt: new Date(),
			})
			.where(eq(searchIndex.id, existing.id));

		// Generate and update embedding
		if (immediate) {
			const embedding = await generateEmbedding(content);
			if (embedding) {
				await db
					.update(searchIndex)
					.set({ embedding })
					.where(eq(searchIndex.id, existing.id));
			}
		} else {
			// Fire-and-forget embedding generation
			generateEmbedding(content).then(async (embedding) => {
				if (embedding) {
					await db
						.update(searchIndex)
						.set({ embedding })
						.where(eq(searchIndex.id, existing.id));
				}
			});
		}
	} else {
		// Create new entry
		const id = createId();
		await db.insert(searchIndex).values({
			id,
			entityType,
			entityId,
			userId,
			content,
			contentTsv: tsvectorSql,
			url,
			visibility,
		});

		// Generate and update embedding
		if (immediate) {
			const embedding = await generateEmbedding(content);
			if (embedding) {
				await db
					.update(searchIndex)
					.set({ embedding })
					.where(eq(searchIndex.id, id));
			}
		} else {
			// Fire-and-forget embedding generation
			generateEmbedding(content).then(async (embedding) => {
				if (embedding) {
					await db
						.update(searchIndex)
						.set({ embedding })
						.where(eq(searchIndex.id, id));
				}
			});
		}
	}
}

/**
 * Remove content from the search index.
 */
export async function removeFromIndex(
	entityType: SearchEntityType,
	entityId: string
): Promise<void> {
	await db
		.delete(searchIndex)
		.where(
			and(
				eq(searchIndex.entityType, entityType),
				eq(searchIndex.entityId, entityId)
			)
		);
}

/**
 * Index a bookmark.
 */
export async function indexBookmark(
	bookmark: {
		id: string;
		userId: string;
		url: string;
		title?: string | null;
		description?: string | null;
		siteName?: string | null;
	},
	options?: { immediate?: boolean }
): Promise<void> {
	const content = buildBookmarkContent(bookmark);
	if (!content) {
		return; // Skip if no searchable content
	}

	await indexContent(
		{
			entityType: "bookmark",
			entityId: bookmark.id,
			userId: bookmark.userId,
			content,
			url: bookmark.url,
			// Bookmarks are private (only visible to owner)
			visibility: "private",
		},
		options
	);
}

/**
 * Index a highlight.
 */
export async function indexHighlight(
	highlight: {
		id: string;
		userId: string;
		url: string;
		text: string;
		visibility: "private" | "friends" | "public";
	},
	options?: { immediate?: boolean }
): Promise<void> {
	const content = buildHighlightContent(highlight);
	if (!content) {
		return;
	}

	await indexContent(
		{
			entityType: "highlight",
			entityId: highlight.id,
			userId: highlight.userId,
			content,
			url: highlight.url,
			visibility: highlight.visibility,
		},
		options
	);
}

/**
 * Index a comment.
 * Comments inherit visibility from their parent highlight.
 */
export async function indexComment(
	comment: {
		id: string;
		authorId: string;
		content: string;
	},
	highlightVisibility: "private" | "friends" | "public",
	highlightUrl: string,
	options?: { immediate?: boolean }
): Promise<void> {
	const content = buildCommentContent(comment);
	if (!content) {
		return;
	}

	await indexContent(
		{
			entityType: "comment",
			entityId: comment.id,
			userId: comment.authorId,
			content,
			url: highlightUrl,
			visibility: highlightVisibility,
		},
		options
	);
}
