import { db } from "@gloss/db";
import {
	bookmark,
	bookmarkTag,
	comment,
	highlight,
	tag,
} from "@gloss/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";

import type { SearchEntityType } from "../lib/search-index";

import { deriveAuth } from "../lib/auth";
import { isSemanticSearchAvailable } from "../lib/embeddings";
import {
	hybridSearch,
	type SearchMode,
	type SearchResult,
	type SearchSortBy,
} from "../lib/hybrid-search";

/**
 * Tag info included in bookmark results.
 */
export interface TagInfo {
	id: string;
	name: string;
	color: string | null;
	isSystem: boolean;
}

/**
 * Hydrated bookmark result.
 */
export interface BookmarkResult {
	type: "bookmark";
	id: string;
	url: string;
	title: string | null;
	description: string | null;
	favicon: string | null;
	createdAt: Date;
	score: number;
	ftsScore: number;
	semanticScore: number;
	tags: TagInfo[];
}

/**
 * Hydrated highlight result.
 */
export interface HighlightResult {
	type: "highlight";
	id: string;
	url: string;
	text: string;
	visibility: "private" | "friends" | "public";
	createdAt: Date;
	user: { id: string; name: string | null; image: string | null };
	score: number;
	ftsScore: number;
	semanticScore: number;
}

/**
 * Hydrated comment result.
 */
export interface CommentResult {
	type: "comment";
	id: string;
	content: string;
	highlightId: string;
	createdAt: Date;
	author: { id: string; name: string | null; image: string | null };
	score: number;
	ftsScore: number;
	semanticScore: number;
}

export type HydratedResult = BookmarkResult | HighlightResult | CommentResult;

/**
 * Build a map from bookmark IDs to their tags.
 */
function buildBookmarkTagsMap(
	bookmarkTagsData: Array<{
		bookmarkId: string;
		tagId: string;
		tagName: string;
		tagColor: string | null;
		tagIsSystem: boolean;
	}>
): Map<string, TagInfo[]> {
	const bookmarkTagsMap = new Map<string, TagInfo[]>();
	for (const bt of bookmarkTagsData) {
		const existing = bookmarkTagsMap.get(bt.bookmarkId) ?? [];
		existing.push({
			id: bt.tagId,
			name: bt.tagName,
			color: bt.tagColor,
			isSystem: bt.tagIsSystem,
		});
		bookmarkTagsMap.set(bt.bookmarkId, existing);
	}
	return bookmarkTagsMap;
}

/**
 * Hydrate a single search result into its full form.
 */
function hydrateResult(
	result: SearchResult,
	bookmarkMap: Map<string, typeof bookmark.$inferSelect>,
	highlightMap: Map<
		string,
		typeof highlight.$inferSelect & {
			user: { id: string; name: string | null; image: string | null };
		}
	>,
	commentMap: Map<
		string,
		typeof comment.$inferSelect & {
			author: { id: string; name: string | null; image: string | null };
		}
	>,
	bookmarkTagsMap: Map<string, TagInfo[]>
): HydratedResult | null {
	if (result.entityType === "bookmark") {
		const b = bookmarkMap.get(result.entityId);
		if (!b) {
			return null;
		}
		return {
			type: "bookmark",
			id: b.id,
			url: b.url,
			title: b.title,
			description: b.description,
			favicon: b.favicon,
			createdAt: b.createdAt,
			score: result.score,
			ftsScore: result.ftsScore,
			semanticScore: result.semanticScore,
			tags: bookmarkTagsMap.get(b.id) ?? [],
		};
	}

	if (result.entityType === "highlight") {
		const h = highlightMap.get(result.entityId);
		if (!h) {
			return null;
		}
		return {
			type: "highlight",
			id: h.id,
			url: h.url,
			text: h.text,
			visibility: h.visibility,
			createdAt: h.createdAt,
			user: h.user,
			score: result.score,
			ftsScore: result.ftsScore,
			semanticScore: result.semanticScore,
		};
	}

	if (result.entityType === "comment") {
		const c = commentMap.get(result.entityId);
		if (!c) {
			return null;
		}
		return {
			type: "comment",
			id: c.id,
			content: c.content,
			highlightId: c.highlightId,
			createdAt: c.createdAt,
			author: c.author,
			score: result.score,
			ftsScore: result.ftsScore,
			semanticScore: result.semanticScore,
		};
	}

	return null;
}

/**
 * Hydrate search results with full entity data.
 */
async function hydrateResults(
	results: SearchResult[]
): Promise<HydratedResult[]> {
	if (results.length === 0) {
		return [];
	}

	// Group results by entity type
	const bookmarkIds = results
		.filter((r) => r.entityType === "bookmark")
		.map((r) => r.entityId);
	const highlightIds = results
		.filter((r) => r.entityType === "highlight")
		.map((r) => r.entityId);
	const commentIds = results
		.filter((r) => r.entityType === "comment")
		.map((r) => r.entityId);

	// Fetch entities in parallel
	const [bookmarks, highlights, comments, bookmarkTagsData] = await Promise.all(
		[
			bookmarkIds.length > 0
				? db.query.bookmark.findMany({
						where: inArray(bookmark.id, bookmarkIds),
					})
				: [],
			highlightIds.length > 0
				? db.query.highlight.findMany({
						where: inArray(highlight.id, highlightIds),
						with: { user: { columns: { id: true, name: true, image: true } } },
					})
				: [],
			commentIds.length > 0
				? db.query.comment.findMany({
						where: inArray(comment.id, commentIds),
						with: {
							author: { columns: { id: true, name: true, image: true } },
						},
					})
				: [],
			// Fetch tags for all bookmarks
			bookmarkIds.length > 0
				? db
						.select({
							bookmarkId: bookmarkTag.bookmarkId,
							tagId: tag.id,
							tagName: tag.name,
							tagColor: tag.color,
							tagIsSystem: tag.isSystem,
						})
						.from(bookmarkTag)
						.innerJoin(tag, eq(bookmarkTag.tagId, tag.id))
						.where(inArray(bookmarkTag.bookmarkId, bookmarkIds))
				: [],
		]
	);

	// Create lookup maps
	const bookmarkMap = new Map(bookmarks.map((b) => [b.id, b]));
	const highlightMap = new Map(highlights.map((h) => [h.id, h]));
	const commentMap = new Map(comments.map((c) => [c.id, c]));
	const bookmarkTagsMap = buildBookmarkTagsMap(bookmarkTagsData);

	// Hydrate results maintaining order
	return results
		.map((result) =>
			hydrateResult(
				result,
				bookmarkMap,
				highlightMap,
				commentMap,
				bookmarkTagsMap
			)
		)
		.filter((r): r is HydratedResult => r !== null);
}

/**
 * Search routes.
 * Hybrid search across bookmarks, highlights, and comments.
 * Supports both session and API key authentication.
 */
export const search = new Elysia({ prefix: "/search" })
	.derive(async ({ request }) => deriveAuth(request))

	// Get search capabilities
	.get("/capabilities", () => {
		return {
			semanticSearchAvailable: isSemanticSearchAvailable(),
			supportedModes: isSemanticSearchAvailable()
				? ["hybrid", "fts", "semantic"]
				: ["fts"],
			supportedTypes: ["bookmark", "highlight", "comment"],
			supportedSortBy: ["relevance", "created"],
			supportedFilters: [
				"types",
				"tagId",
				"tagName",
				"url",
				"domain",
				"after",
				"before",
			],
		};
	})

	// Hybrid search
	.get(
		"/",
		async ({ query, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const {
				q,
				limit = 20,
				offset = 0,
				mode = "hybrid",
				types,
				tagId,
				tagName,
				url: urlPattern,
				domain,
				after,
				before,
				sortBy = "relevance",
			} = query;

			// Validate mode
			const validModes: SearchMode[] = ["hybrid", "fts", "semantic"];
			if (!validModes.includes(mode as SearchMode)) {
				set.status = 400;
				return {
					error: `Invalid mode. Must be one of: ${validModes.join(", ")}`,
				};
			}

			// Validate sortBy
			const validSortBy: SearchSortBy[] = ["relevance", "created"];
			if (!validSortBy.includes(sortBy as SearchSortBy)) {
				set.status = 400;
				return {
					error: `Invalid sortBy. Must be one of: ${validSortBy.join(", ")}`,
				};
			}

			// Parse entity types
			let entityTypes: SearchEntityType[] | undefined;
			if (types) {
				const typeList = types.split(",").map((t) => t.trim());
				const validTypes: SearchEntityType[] = [
					"bookmark",
					"highlight",
					"comment",
				];
				const invalidTypes = typeList.filter(
					(t) => !validTypes.includes(t as SearchEntityType)
				);
				if (invalidTypes.length > 0) {
					set.status = 400;
					return {
						error: `Invalid types: ${invalidTypes.join(", ")}. Must be one of: ${validTypes.join(", ")}`,
					};
				}
				entityTypes = typeList as SearchEntityType[];
			}

			// Resolve tag by ID or name
			let validatedTagId: string | undefined;
			if (tagId) {
				// Direct tag ID lookup
				const userTag = await db.query.tag.findFirst({
					where: and(eq(tag.id, tagId), eq(tag.userId, session.user.id)),
				});
				if (userTag) {
					validatedTagId = tagId;
				}
			} else if (tagName) {
				// Lookup tag by name (case-insensitive)
				const normalizedName = tagName.trim().toLowerCase();
				const userTag = await db.query.tag.findFirst({
					where: and(
						eq(tag.name, normalizedName),
						eq(tag.userId, session.user.id)
					),
				});
				if (userTag) {
					validatedTagId = userTag.id;
				}
			}

			// Parse date filters
			let afterDate: Date | undefined;
			let beforeDate: Date | undefined;
			if (after) {
				afterDate = new Date(after);
				if (Number.isNaN(afterDate.getTime())) {
					set.status = 400;
					return { error: "Invalid 'after' date. Use ISO 8601 format." };
				}
			}
			if (before) {
				beforeDate = new Date(before);
				if (Number.isNaN(beforeDate.getTime())) {
					set.status = 400;
					return { error: "Invalid 'before' date. Use ISO 8601 format." };
				}
			}

			// Fall back to FTS if semantic search is requested but not available
			let effectiveMode = mode as SearchMode;
			if (
				(mode === "hybrid" || mode === "semantic") &&
				!isSemanticSearchAvailable()
			) {
				effectiveMode = "fts";
			}

			// Perform search with graceful error handling
			try {
				const results = await hybridSearch({
					query: q,
					userId: session.user.id,
					mode: effectiveMode,
					entityTypes,
					limit,
					offset,
					tagId: validatedTagId,
					urlPattern,
					domain,
					after: afterDate,
					before: beforeDate,
					sortBy: sortBy as SearchSortBy,
				});

				const hydrated = await hydrateResults(results);

				return {
					results: hydrated,
					meta: {
						query: q,
						mode: effectiveMode,
						semanticSearchUsed:
							effectiveMode !== "fts" && isSemanticSearchAvailable(),
						total: hydrated.length,
						limit,
						offset,
						sortBy,
					},
				};
			} catch (error) {
				console.error("[search] Search failed:", error);
				return {
					results: [],
					meta: {
						query: q,
						mode: "fts" as SearchMode,
						semanticSearchUsed: false,
						total: 0,
						limit,
						offset,
						sortBy,
						error: "Search temporarily unavailable",
					},
				};
			}
		},
		{
			query: t.Object({
				q: t.String({ minLength: 1 }),
				limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
				offset: t.Optional(t.Number({ minimum: 0, default: 0 })),
				mode: t.Optional(t.String()),
				types: t.Optional(t.String()),
				tagId: t.Optional(t.String()),
				tagName: t.Optional(t.String()),
				url: t.Optional(t.String()),
				domain: t.Optional(t.String()),
				after: t.Optional(t.String()),
				before: t.Optional(t.String()),
				sortBy: t.Optional(t.String()),
			}),
		}
	);
