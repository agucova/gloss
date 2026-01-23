import { relations } from "drizzle-orm";
import {
	customType,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { visibilityEnum } from "./enums";

/**
 * Entity types that can be indexed for search.
 */
export const searchEntityTypeEnum = pgEnum("search_entity_type", [
	"bookmark",
	"highlight",
	"comment",
]);

/**
 * Custom type for PostgreSQL tsvector.
 */
const tsvector = customType<{ data: string }>({
	dataType() {
		return "tsvector";
	},
});

/**
 * Custom type for pgvector embedding.
 * Using 1536 dimensions for OpenAI text-embedding-3-small.
 */
const vector = customType<{ data: number[] }>({
	dataType() {
		return "vector(1536)";
	},
	toDriver(value: number[]): string {
		return `[${value.join(",")}]`;
	},
	fromDriver(value: unknown): number[] {
		if (typeof value === "string") {
			// Parse "[1,2,3]" format from postgres
			return JSON.parse(value);
		}
		return value as number[];
	},
});

/**
 * Centralized search index for hybrid search across bookmarks, highlights, and comments.
 * Denormalizes content from all searchable entities for efficient FTS + vector search.
 */
export const searchIndex = pgTable(
	"search_index",
	{
		id: text("id").primaryKey(),
		// Entity identification
		entityType: searchEntityTypeEnum("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		// User for access control
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Denormalized searchable content
		content: text("content").notNull(),
		// PostgreSQL full-text search vector (generated from content)
		contentTsv: tsvector("content_tsv"),
		// Embedding for semantic search (nullable for graceful degradation)
		embedding: vector("embedding"),
		// Additional metadata for filtering
		url: text("url"),
		visibility: visibilityEnum("visibility"),
		// Timestamps
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		// Unique constraint on entity type + id
		index("search_index_entity_unique").on(table.entityType, table.entityId),
		// User index for filtering
		index("search_index_user_idx").on(table.userId),
		// Visibility index for filtering
		index("search_index_visibility_idx").on(table.visibility),
		// GIN index on tsvector for full-text search
		index("search_index_content_tsv_idx").using("gin", table.contentTsv),
		// IVFFlat index on embedding for approximate nearest neighbor search
		// Note: IVFFlat requires data in the table before creation; run backfill first
		index("search_index_embedding_idx")
			.using("ivfflat", table.embedding.op("vector_cosine_ops"))
			.with({ lists: 100 }),
	]
);

/**
 * Relations for the search index.
 */
export const searchIndexRelations = relations(searchIndex, ({ one }) => ({
	user: one(user, {
		fields: [searchIndex.userId],
		references: [user.id],
	}),
}));
