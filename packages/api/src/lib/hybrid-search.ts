import { db } from "@gloss/db";
import { bookmarkTag, searchIndex } from "@gloss/db/schema";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";

import type { SearchEntityType, SearchVisibility } from "./search-index";

import { generateEmbedding, isSemanticSearchAvailable } from "./embeddings";
import { getFriendIds } from "./friends";

/**
 * Cached pgvector availability state.
 * When pgvector fails, we cache the unavailability for 60 seconds
 * to avoid repeated failing queries.
 */
let pgvectorUnavailableUntil = 0;

function isPgvectorAvailable(): boolean {
	return Date.now() >= pgvectorUnavailableUntil;
}

function markPgvectorUnavailable(): void {
	pgvectorUnavailableUntil = Date.now() + 60_000;
}

function isPgvectorError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("vector") ||
		message.includes("operator does not exist") ||
		message.includes("<=>")
	);
}

/**
 * Search mode determines which scoring methods are used.
 */
export type SearchMode = "hybrid" | "fts" | "semantic";

/**
 * Search result from the hybrid search.
 */
export interface SearchResult {
	id: string;
	entityType: SearchEntityType;
	entityId: string;
	userId: string;
	content: string;
	url: string | null;
	visibility: SearchVisibility | null;
	/** Full-text search rank (0-1, higher is better) */
	ftsScore: number;
	/** Semantic similarity score (0-1, higher is better) */
	semanticScore: number;
	/** Combined hybrid score (0-1, higher is better) */
	score: number;
}

/**
 * Sort order for search results.
 */
export type SearchSortBy = "relevance" | "created";

/**
 * Search parameters.
 */
export interface SearchParams {
	query: string;
	userId: string;
	mode?: SearchMode;
	entityTypes?: SearchEntityType[];
	limit?: number;
	offset?: number;
	/** Filter bookmarks by tag ID (only applies to bookmark entity type) */
	tagId?: string;
	/** URL pattern filter (supports LIKE patterns with %) */
	urlPattern?: string;
	/** Domain filter (e.g., "arxiv.org") */
	domain?: string;
	/** Created after this date (ISO 8601) */
	after?: Date;
	/** Created before this date (ISO 8601) */
	before?: Date;
	/** Sort order: "relevance" (default) or "created" */
	sortBy?: SearchSortBy;
}

/**
 * Perform hybrid search combining FTS and semantic search.
 *
 * Visibility rules:
 * - Own content: always visible
 * - Friends' content: visible if visibility is 'friends' or 'public'
 * - Others' content: visible only if visibility is 'public'
 */
export async function hybridSearch(
	params: SearchParams
): Promise<SearchResult[]> {
	const {
		query,
		userId,
		mode = "hybrid",
		entityTypes,
		limit = 20,
		offset = 0,
		tagId,
		urlPattern,
		domain,
		after,
		before,
		sortBy = "relevance",
	} = params;

	// Get friend IDs for visibility filtering
	const friendIds = await getFriendIds(userId);

	// Generate query embedding for semantic search (skip if pgvector is known-unavailable)
	let queryEmbedding: number[] | null = null;
	if (
		(mode === "hybrid" || mode === "semantic") &&
		isSemanticSearchAvailable() &&
		isPgvectorAvailable()
	) {
		queryEmbedding = await generateEmbedding(query);
	}

	// Build the SQL query
	const conditions: ReturnType<typeof and>[] = [];

	// Entity type filter
	if (entityTypes && entityTypes.length > 0) {
		conditions.push(inArray(searchIndex.entityType, entityTypes));
	}

	// Visibility filter: user sees own content + friends' friends/public + anyone's public
	conditions.push(
		or(
			// Own content (any visibility)
			eq(searchIndex.userId, userId),
			// Friends' content with friends or public visibility
			and(
				inArray(searchIndex.userId, [userId, ...friendIds]),
				or(
					eq(searchIndex.visibility, "friends"),
					eq(searchIndex.visibility, "public")
				)
			),
			// Public content from anyone
			eq(searchIndex.visibility, "public")
		)
	);

	// Tag filter: when tagId is provided, filter bookmarks to only those with that tag
	// Non-bookmark entities (highlights, comments) pass through unfiltered
	if (tagId) {
		conditions.push(
			or(
				// Non-bookmark entities pass through
				ne(searchIndex.entityType, "bookmark"),
				// Bookmarks must have the specified tag
				sql`EXISTS (
					SELECT 1 FROM ${bookmarkTag}
					WHERE ${bookmarkTag.bookmarkId} = ${searchIndex.entityId}
					AND ${bookmarkTag.tagId} = ${tagId}
				)`
			)
		);
	}

	// URL pattern filter: use ILIKE for case-insensitive matching
	if (urlPattern) {
		// Escape special chars and convert * to % for LIKE pattern
		const likePattern = urlPattern.replace(/\*/g, "%");
		conditions.push(sql`${searchIndex.url} ILIKE ${likePattern}`);
	}

	// Domain filter: extract domain from URL and match
	if (domain) {
		// Match domain in URL (handles http/https and optional www prefix)
		const domainPattern = `%://${domain}%`;
		const wwwDomainPattern = `%://www.${domain}%`;
		conditions.push(
			or(
				sql`${searchIndex.url} ILIKE ${domainPattern}`,
				sql`${searchIndex.url} ILIKE ${wwwDomainPattern}`
			)
		);
	}

	// Date range filters
	if (after) {
		conditions.push(sql`${searchIndex.createdAt} >= ${after}`);
	}
	if (before) {
		conditions.push(sql`${searchIndex.createdAt} <= ${before}`);
	}

	// Construct the query based on mode
	let results: SearchResult[];

	if (mode === "fts" || !queryEmbedding) {
		// FTS-only search
		const ftsQuery = sql`plainto_tsquery('english', ${query})`;

		const rows = await db
			.select({
				id: searchIndex.id,
				entityType: searchIndex.entityType,
				entityId: searchIndex.entityId,
				userId: searchIndex.userId,
				content: searchIndex.content,
				url: searchIndex.url,
				visibility: searchIndex.visibility,
				createdAt: searchIndex.createdAt,
				ftsRank:
					sql<number>`ts_rank(${searchIndex.contentTsv}, ${ftsQuery})`.as(
						"fts_rank"
					),
			})
			.from(searchIndex)
			.where(and(...conditions, sql`${searchIndex.contentTsv} @@ ${ftsQuery}`))
			.orderBy(
				sortBy === "created"
					? sql`${searchIndex.createdAt} DESC`
					: sql`fts_rank DESC`
			)
			.limit(limit)
			.offset(offset);

		results = rows.map((row) => ({
			...row,
			visibility: row.visibility as SearchVisibility | null,
			ftsScore: row.ftsRank,
			semanticScore: 0,
			score: row.ftsRank,
		}));
	} else if (mode === "semantic") {
		// Semantic-only search (with FTS fallback if pgvector fails)
		try {
			const embeddingStr = `[${queryEmbedding.join(",")}]`;

			const rows = await db
				.select({
					id: searchIndex.id,
					entityType: searchIndex.entityType,
					entityId: searchIndex.entityId,
					userId: searchIndex.userId,
					content: searchIndex.content,
					url: searchIndex.url,
					visibility: searchIndex.visibility,
					createdAt: searchIndex.createdAt,
					similarity:
						sql<number>`1 - (${searchIndex.embedding} <=> ${embeddingStr}::vector)`.as(
							"similarity"
						),
				})
				.from(searchIndex)
				.where(and(...conditions, sql`${searchIndex.embedding} IS NOT NULL`))
				.orderBy(
					sortBy === "created"
						? sql`${searchIndex.createdAt} DESC`
						: sql`similarity DESC`
				)
				.limit(limit)
				.offset(offset);

			results = rows.map((row) => ({
				...row,
				visibility: row.visibility as SearchVisibility | null,
				ftsScore: 0,
				semanticScore: row.similarity,
				score: row.similarity,
			}));
		} catch (error) {
			if (isPgvectorError(error)) {
				console.warn(
					"[search] pgvector unavailable, falling back to FTS-only:",
					error instanceof Error ? error.message : error
				);
				markPgvectorUnavailable();
				return hybridSearch({ ...params, mode: "fts" });
			}
			throw error;
		}
	} else {
		// Hybrid search: combine FTS and semantic scores (with FTS fallback if pgvector fails)
		try {
			const ftsQuery = sql`plainto_tsquery('english', ${query})`;
			const embeddingStr = `[${queryEmbedding.join(",")}]`;

			const rows = await db
				.select({
					id: searchIndex.id,
					entityType: searchIndex.entityType,
					entityId: searchIndex.entityId,
					userId: searchIndex.userId,
					content: searchIndex.content,
					url: searchIndex.url,
					visibility: searchIndex.visibility,
					createdAt: searchIndex.createdAt,
					ftsRank:
						sql<number>`COALESCE(ts_rank(${searchIndex.contentTsv}, ${ftsQuery}), 0)`.as(
							"fts_rank"
						),
					similarity:
						sql<number>`COALESCE(1 - (${searchIndex.embedding} <=> ${embeddingStr}::vector), 0)`.as(
							"similarity"
						),
				})
				.from(searchIndex)
				.where(
					and(
						...conditions,
						or(
							sql`${searchIndex.contentTsv} @@ ${ftsQuery}`,
							sql`${searchIndex.embedding} IS NOT NULL`
						)
					)
				)
				.orderBy(
					sortBy === "created"
						? sql`${searchIndex.createdAt} DESC`
						: sql`(COALESCE(ts_rank(${searchIndex.contentTsv}, ${ftsQuery}), 0) * 0.5 + COALESCE(1 - (${searchIndex.embedding} <=> ${embeddingStr}::vector), 0) * 0.5) DESC`
				)
				.limit(limit)
				.offset(offset);

			results = rows.map((row) => ({
				...row,
				visibility: row.visibility as SearchVisibility | null,
				ftsScore: row.ftsRank,
				semanticScore: row.similarity,
				score: row.ftsRank * 0.5 + row.similarity * 0.5,
			}));
		} catch (error) {
			if (isPgvectorError(error)) {
				console.warn(
					"[search] pgvector unavailable, falling back to FTS-only:",
					error instanceof Error ? error.message : error
				);
				markPgvectorUnavailable();
				return hybridSearch({ ...params, mode: "fts" });
			}
			throw error;
		}
	}

	return results;
}
