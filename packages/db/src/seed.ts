/**
 * Database seed script for local development.
 * Creates test users, friendships, highlights, and bookmarks.
 *
 * Run with: bun run db:seed
 */

import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import dotenv from "dotenv";
import { like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { account, bookmark, friendship, highlight, user } from "./schema";

// Load env from server's .env file (can be overridden via ENV_FILE)
const envFile = process.env.ENV_FILE || "../../apps/server/.env";
dotenv.config({ path: envFile });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is required. Check apps/server/.env");
	process.exit(1);
}

// Create a direct db connection (bypasses @gloss/env validation)
const db = drizzle(DATABASE_URL);

const scryptAsync = promisify(scrypt);

// Better-Auth scrypt parameters (must match exactly)
const SCRYPT_CONFIG = {
	N: 16_384, // CPU/memory cost
	r: 16, // block size
	p: 1, // parallelization
	dkLen: 64, // derived key length
};

/**
 * Hash a password using scrypt (Better-Auth compatible format).
 * Format: salt:hash (both hex encoded)
 *
 * Important: Better-Auth passes the hex STRING as salt to scrypt,
 * meaning scrypt sees the ASCII bytes of "abc123...", not raw bytes.
 */
async function hashPassword(password: string): Promise<string> {
	// Generate salt and convert to hex string
	const saltHex = randomBytes(16).toString("hex");
	// Pass the hex STRING to scrypt (this is what Better-Auth does)
	const derivedKey = (await scryptAsync(
		password.normalize("NFKC"),
		saltHex, // string, not Buffer
		SCRYPT_CONFIG.dkLen,
		{
			N: SCRYPT_CONFIG.N,
			r: SCRYPT_CONFIG.r,
			p: SCRYPT_CONFIG.p,
			maxmem: 128 * SCRYPT_CONFIG.N * SCRYPT_CONFIG.r * 2,
		}
	)) as Buffer;
	return `${saltHex}:${derivedKey.toString("hex")}`;
}

/**
 * Generate a deterministic seed ID.
 * Format: seed_<name> padded to 25 chars for CUID-like length.
 */
function seedId(name: string): string {
	return `seed_${name}`.padEnd(25, "0");
}

/**
 * Normalize a URL for consistent storage.
 */
function normalizeUrl(urlString: string): string {
	const url = new URL(urlString);
	url.hostname = url.hostname.toLowerCase();
	url.hash = "";
	const trackingParams = [
		"utm_source",
		"utm_medium",
		"utm_campaign",
		"utm_term",
		"utm_content",
		"fbclid",
		"gclid",
		"ref",
		"source",
	];
	for (const param of trackingParams) {
		url.searchParams.delete(param);
	}
	url.searchParams.sort();
	if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
		url.pathname = url.pathname.slice(0, -1);
	}
	return url.toString();
}

/**
 * Generate a SHA-256 hash of a URL for indexing.
 */
async function hashUrl(url: string): Promise<string> {
	const normalizedUrl = normalizeUrl(url);
	const encoder = new TextEncoder();
	const data = encoder.encode(normalizedUrl);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// =============================================================================
// Seed Data
// =============================================================================

const USERS = [
	{ id: seedId("alice"), name: "Alice Chen", email: "alice@example.com" },
	{ id: seedId("bob"), name: "Bob Martinez", email: "bob@example.com" },
	{ id: seedId("carol"), name: "Carol Davis", email: "carol@example.com" },
	{ id: seedId("dan"), name: "Dan Wilson", email: "dan@example.com" },
	{ id: seedId("eve"), name: "Eve Johnson", email: "eve@example.com" },
] as const;

const FRIENDSHIPS = [
	{ requester: "alice", addressee: "bob", status: "accepted" as const },
	{ requester: "carol", addressee: "alice", status: "accepted" as const },
	{ requester: "dan", addressee: "alice", status: "pending" as const },
	{ requester: "eve", addressee: "bob", status: "accepted" as const },
];

const URLS = {
	commonplace: "https://en.wikipedia.org/wiki/Commonplace_book",
	paulgraham: "https://www.paulgraham.com/read.html",
	marginalia: "https://en.wikipedia.org/wiki/Marginalia",
};

/**
 * Create a minimal selector for seed data.
 * Uses TextQuoteSelector which is most robust for re-anchoring.
 */
function createSelector(text: string, prefix = "", suffix = "") {
	return {
		range: {
			type: "RangeSelector" as const,
			startContainer: "",
			startOffset: 0,
			endContainer: "",
			endOffset: 0,
		},
		position: {
			type: "TextPositionSelector" as const,
			start: 0,
			end: text.length,
		},
		quote: {
			type: "TextQuoteSelector" as const,
			exact: text,
			prefix,
			suffix,
		},
	};
}

const HIGHLIGHTS = [
	{
		id: seedId("hl_alice_1"),
		userId: seedId("alice"),
		url: URLS.commonplace,
		text: "Commonplaces are used by readers, writers, students, and scholars as an aid for remembering useful concepts or facts they have learned.",
		color: "#FFE4B5",
		visibility: "friends" as const,
		prefix: "knowledge management. ",
		suffix: " They became particularly",
	},
	{
		id: seedId("hl_alice_2"),
		userId: seedId("alice"),
		url: URLS.paulgraham,
		text: "Reading and experience train your model of the world. And even if you forget the experience or what you read, its effect on your model of the world persists.",
		color: "#FFFACD",
		visibility: "public" as const,
		prefix: "",
		suffix: " Your mind is like a",
	},
	{
		id: seedId("hl_bob_1"),
		userId: seedId("bob"),
		url: URLS.commonplace,
		text: "John Locke wrote a treatise in French on commonplace books, translated into English as A New Method of Making Common-Place-Books.",
		color: "#E6E6FA",
		visibility: "friends" as const,
		prefix: "17th century. ",
		suffix: " The philosopher",
	},
	{
		id: seedId("hl_bob_2"),
		userId: seedId("bob"),
		url: URLS.paulgraham,
		text: "If you read enough, there will be things you'll learn that will later connect with things you're working on.",
		color: "#FFB6C1",
		visibility: "private" as const,
		prefix: "of the world. ",
		suffix: " But there's",
	},
	{
		id: seedId("hl_carol_1"),
		userId: seedId("carol"),
		url: URLS.marginalia,
		text: "Marginalia can add to, clarify, or offer a different perspective on the content of the main text.",
		color: "#98FB98",
		visibility: "friends" as const,
		prefix: "in the margins. ",
		suffix: " Readers have",
	},
	{
		id: seedId("hl_eve_1"),
		userId: seedId("eve"),
		url: URLS.paulgraham,
		text: "The way to read is to look for ideas that are new to you, and to try to understand them.",
		color: "#ADD8E6",
		visibility: "public" as const,
		prefix: "read carefully. ",
		suffix: " When you",
	},
];

const BOOKMARKS = [
	{
		id: seedId("bm_alice_1"),
		userId: seedId("alice"),
		url: URLS.paulgraham,
		title: "How to Read",
		description: "Paul Graham on reading and learning",
	},
	{
		id: seedId("bm_alice_2"),
		userId: seedId("alice"),
		url: URLS.commonplace,
		title: "Commonplace book - Wikipedia",
		description: "History of knowledge management",
	},
	{
		id: seedId("bm_bob_1"),
		userId: seedId("bob"),
		url: URLS.commonplace,
		title: "Commonplace book - Wikipedia",
		description: null,
	},
];

// =============================================================================
// Seed Functions
// =============================================================================

async function clearSeedData() {
	console.log("Clearing existing seed data...");

	// Delete in reverse dependency order
	await db.delete(highlight).where(like(highlight.id, "seed_%"));
	await db.delete(bookmark).where(like(bookmark.id, "seed_%"));
	await db.delete(friendship).where(like(friendship.id, "seed_%"));
	await db.delete(account).where(like(account.id, "seed_%"));
	await db.delete(user).where(like(user.id, "seed_%"));

	console.log("  Cleared.");
}

async function seedUsers() {
	console.log("Seeding users...");
	const passwordHash = await hashPassword("password123");

	for (const u of USERS) {
		await db.insert(user).values({
			id: u.id,
			name: u.name,
			email: u.email,
			emailVerified: true,
		});

		await db.insert(account).values({
			id: seedId(`acc_${u.id.slice(5, 15)}`),
			userId: u.id,
			accountId: u.id,
			providerId: "credential",
			password: passwordHash,
		});
	}

	console.log(`  Created ${USERS.length} users.`);
}

async function seedFriendships() {
	console.log("Seeding friendships...");

	for (const f of FRIENDSHIPS) {
		await db.insert(friendship).values({
			id: seedId(`fr_${f.requester}_${f.addressee}`),
			requesterId: seedId(f.requester),
			addresseeId: seedId(f.addressee),
			status: f.status,
		});
	}

	console.log(`  Created ${FRIENDSHIPS.length} friendships.`);
}

async function seedHighlights() {
	console.log("Seeding highlights...");

	for (const h of HIGHLIGHTS) {
		const urlHash = await hashUrl(h.url);
		await db.insert(highlight).values({
			id: h.id,
			userId: h.userId,
			url: normalizeUrl(h.url),
			urlHash,
			selector: createSelector(h.text, h.prefix, h.suffix),
			text: h.text,
			color: h.color,
			visibility: h.visibility,
		});
	}

	console.log(`  Created ${HIGHLIGHTS.length} highlights.`);
}

async function seedBookmarks() {
	console.log("Seeding bookmarks...");

	for (const b of BOOKMARKS) {
		const urlHash = await hashUrl(b.url);
		await db.insert(bookmark).values({
			id: b.id,
			userId: b.userId,
			url: normalizeUrl(b.url),
			urlHash,
			title: b.title,
			description: b.description,
		});
	}

	console.log(`  Created ${BOOKMARKS.length} bookmarks.`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	console.log("\n=== Gloss Database Seed ===\n");

	await clearSeedData();
	await seedUsers();
	await seedFriendships();
	await seedHighlights();
	await seedBookmarks();

	console.log("\n=== Seed Complete ===");
	console.log("\nTest accounts (all use password: password123):");
	for (const u of USERS) {
		console.log(`  - ${u.email} (${u.name})`);
	}
	console.log("");

	process.exit(0);
}

main().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
