/**
 * Backfill script for populating the search index with existing data.
 *
 * Usage: bun run packages/db/src/backfill-search-index.ts
 *
 * Features:
 * - Batch processing (100 records at a time)
 * - Rate limiting for OpenAI API
 * - Cursor-based pagination (resumable)
 * - Progress logging
 */

import { createId } from "@paralleldrive/cuid2";
import { config } from "dotenv";
import { gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

import { bookmark, comment, highlight, searchIndex } from "./schema";

// Load .env from monorepo root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../.env");
if (existsSync(envPath)) {
	config({ path: envPath });
}

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DATABASE_URL) {
	console.error("DATABASE_URL is required");
	process.exit(1);
}

// Initialize database
const db = drizzle(DATABASE_URL);

// Initialize OpenAI client if available
let openai: OpenAI | null = null;
if (OPENAI_API_KEY) {
	openai = new OpenAI({ apiKey: OPENAI_API_KEY });
	console.log("OpenAI API key found - embeddings will be generated");
} else {
	console.log("No OpenAI API key - only FTS vectors will be generated");
}

// Configuration
const BATCH_SIZE = 100;
const EMBEDDING_BATCH_SIZE = 20; // Smaller batches for embeddings to avoid rate limits
const RATE_LIMIT_DELAY_MS = 100; // Delay between embedding batches

/**
 * Build searchable content for a bookmark.
 */
function buildBookmarkContent(b: {
	title: string | null;
	description: string | null;
	url: string;
	siteName: string | null;
}): string {
	const parts: string[] = [];
	if (b.title) parts.push(b.title);
	if (b.description) parts.push(b.description);
	if (b.siteName) parts.push(b.siteName);
	try {
		const domain = new URL(b.url).hostname.replace("www.", "");
		parts.push(domain);
	} catch {
		// Invalid URL, skip domain
	}
	return parts.join(" ").trim();
}

/**
 * Build searchable content for a highlight.
 */
function buildHighlightContent(h: { text: string; url: string }): string {
	const parts = [h.text];
	try {
		const domain = new URL(h.url).hostname.replace("www.", "");
		parts.push(domain);
	} catch {
		// Invalid URL, skip domain
	}
	return parts.join(" ").trim();
}

/**
 * Build searchable content for a comment.
 */
function buildCommentContent(c: { content: string }): string {
	return c.content.trim();
}

/**
 * Generate embeddings for a batch of texts.
 */
async function generateEmbeddings(
	texts: string[]
): Promise<(number[] | null)[]> {
	if (!openai || texts.length === 0) {
		return texts.map(() => null);
	}

	try {
		const response = await openai.embeddings.create({
			model: "text-embedding-3-small",
			input: texts,
		});

		const embeddings: (number[] | null)[] = new Array(texts.length).fill(null);
		for (const item of response.data) {
			embeddings[item.index] = item.embedding;
		}
		return embeddings;
	} catch (error) {
		console.error("Failed to generate embeddings:", error);
		return texts.map(() => null);
	}
}

/**
 * Delay helper for rate limiting.
 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Index a batch of records and generate embeddings.
 */
async function indexBatch(
	records: Array<{
		id: string;
		entityType: "bookmark" | "highlight" | "comment";
		entityId: string;
		userId: string;
		content: string;
		url: string | null;
		visibility: "private" | "friends" | "public" | null;
	}>
): Promise<void> {
	if (records.length === 0) return;

	// Insert records with tsvector (no embedding yet)
	for (const record of records) {
		const tsvectorSql = sql`to_tsvector('english', ${record.content})`;
		await db
			.insert(searchIndex)
			.values({
				id: record.id,
				entityType: record.entityType,
				entityId: record.entityId,
				userId: record.userId,
				content: record.content,
				contentTsv: tsvectorSql,
				url: record.url,
				visibility: record.visibility,
			})
			.onConflictDoNothing();
	}

	// Generate embeddings in smaller batches
	if (openai) {
		for (let i = 0; i < records.length; i += EMBEDDING_BATCH_SIZE) {
			const batch = records.slice(i, i + EMBEDDING_BATCH_SIZE);
			const texts = batch.map((r) => r.content);
			const embeddings = await generateEmbeddings(texts);

			// Update records with embeddings
			for (let j = 0; j < batch.length; j++) {
				const embedding = embeddings[j];
				if (embedding) {
					await db
						.update(searchIndex)
						.set({ embedding })
						.where(sql`${searchIndex.id} = ${batch[j]!.id}`);
				}
			}

			// Rate limit delay
			if (i + EMBEDDING_BATCH_SIZE < records.length) {
				await delay(RATE_LIMIT_DELAY_MS);
			}
		}
	}
}

/**
 * Backfill bookmarks.
 */
async function backfillBookmarks(): Promise<number> {
	console.log("\n📚 Backfilling bookmarks...");
	let processed = 0;
	let cursor: string | null = null;

	while (true) {
		const bookmarks = await db
			.select()
			.from(bookmark)
			.where(cursor ? gt(bookmark.id, cursor) : undefined)
			.orderBy(bookmark.id)
			.limit(BATCH_SIZE);

		if (bookmarks.length === 0) break;

		const records = bookmarks
			.map((b) => {
				const content = buildBookmarkContent(b);
				if (!content) return null;
				return {
					id: createId(),
					entityType: "bookmark" as const,
					entityId: b.id,
					userId: b.userId,
					content,
					url: b.url,
					visibility: "private" as const,
				};
			})
			.filter((r): r is NonNullable<typeof r> => r !== null);

		await indexBatch(records);
		processed += bookmarks.length;
		cursor = bookmarks.at(-1)!.id;
		console.log(`  Processed ${processed} bookmarks...`);
	}

	console.log(`✅ Completed: ${processed} bookmarks indexed`);
	return processed;
}

/**
 * Backfill highlights.
 */
async function backfillHighlights(): Promise<number> {
	console.log("\n🖍️  Backfilling highlights...");
	let processed = 0;
	let cursor: string | null = null;

	while (true) {
		const highlights = await db
			.select()
			.from(highlight)
			.where(cursor ? gt(highlight.id, cursor) : undefined)
			.orderBy(highlight.id)
			.limit(BATCH_SIZE);

		if (highlights.length === 0) break;

		const records = highlights
			.map((h) => {
				const content = buildHighlightContent(h);
				if (!content) return null;
				return {
					id: createId(),
					entityType: "highlight" as const,
					entityId: h.id,
					userId: h.userId,
					content,
					url: h.url,
					visibility: h.visibility,
				};
			})
			.filter((r): r is NonNullable<typeof r> => r !== null);

		await indexBatch(records);
		processed += highlights.length;
		cursor = highlights.at(-1)!.id;
		console.log(`  Processed ${processed} highlights...`);
	}

	console.log(`✅ Completed: ${processed} highlights indexed`);
	return processed;
}

/**
 * Backfill comments.
 */
async function backfillComments(): Promise<number> {
	console.log("\n💬 Backfilling comments...");
	let processed = 0;
	let cursor: string | null = null;

	while (true) {
		const comments = await db
			.select({
				comment,
				highlight: {
					url: highlight.url,
					visibility: highlight.visibility,
				},
			})
			.from(comment)
			.innerJoin(highlight, sql`${comment.highlightId} = ${highlight.id}`)
			.where(cursor ? gt(comment.id, cursor) : undefined)
			.orderBy(comment.id)
			.limit(BATCH_SIZE);

		if (comments.length === 0) break;

		const records = comments
			.filter((c) => !c.comment.deletedAt) // Skip soft-deleted comments
			.map((c) => {
				const content = buildCommentContent(c.comment);
				if (!content) return null;
				return {
					id: createId(),
					entityType: "comment" as const,
					entityId: c.comment.id,
					userId: c.comment.authorId,
					content,
					url: c.highlight.url,
					visibility: c.highlight.visibility,
				};
			})
			.filter((r): r is NonNullable<typeof r> => r !== null);

		await indexBatch(records);
		processed += comments.length;
		cursor = comments.at(-1)!.comment.id;
		console.log(`  Processed ${processed} comments...`);
	}

	console.log(`✅ Completed: ${processed} comments indexed`);
	return processed;
}

/**
 * Main backfill function.
 */
async function main(): Promise<void> {
	console.log("🔍 Starting search index backfill...");
	console.log(`   Batch size: ${BATCH_SIZE}`);
	console.log(`   Embedding batch size: ${EMBEDDING_BATCH_SIZE}`);

	const startTime = Date.now();

	try {
		const [bookmarkCount, highlightCount, commentCount] = await Promise.all([
			backfillBookmarks(),
			backfillHighlights(),
			backfillComments(),
		]);

		const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
		const total = bookmarkCount + highlightCount + commentCount;

		console.log("\n🎉 Backfill complete!");
		console.log(`   Total records: ${total}`);
		console.log(`   Time elapsed: ${totalTime}s`);
	} catch (error) {
		console.error("\n❌ Backfill failed:", error);
		process.exit(1);
	}

	process.exit(0);
}

main();
