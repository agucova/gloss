/**
 * Database setup script. Creates required PostgreSQL extensions.
 * Safe to run multiple times (idempotent).
 *
 * Run with: bun run db:setup
 */

import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

const envFile = process.env.ENV_FILE || "../../.env";
dotenv.config({ path: envFile });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is required. Check .env at repo root");
	process.exit(1);
}

const db = drizzle(DATABASE_URL);

async function main() {
	console.log("\n=== Gloss Database Setup ===\n");

	// pgvector: required for semantic search embeddings
	console.log("Creating pgvector extension...");
	await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

	// Verify the extension was installed
	const result = await db.execute(
		sql`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`
	);

	if (result.rows.length > 0) {
		const { extname, extversion } = result.rows[0] as {
			extname: string;
			extversion: string;
		};
		console.log(`  Installed: ${extname} v${extversion}`);
	} else {
		console.error(
			"  Failed: pgvector extension not found after CREATE EXTENSION."
		);
		console.error(
			"  Make sure pgvector is available in your PostgreSQL installation."
		);
		process.exit(1);
	}

	console.log("\n=== Setup Complete ===\n");
	process.exit(0);
}

main().catch((err) => {
	console.error("Setup failed:", err);
	process.exit(1);
});
