/**
 * Database seed script for local development.
 * Creates test users, friendships, highlights, and bookmarks.
 *
 * Run with: bun run db:seed
 */

import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import dotenv from "dotenv";
import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
	account,
	bookmark,
	bookmarkTag,
	comment,
	friendship,
	highlight,
	tag,
	user,
} from "./schema";

// Load env from root .env file (can be overridden via ENV_FILE for prod)
const envFile = process.env.ENV_FILE || "../../.env";
dotenv.config({ path: envFile });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is required. Check .env at repo root");
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
	{
		id: seedId("agucova"),
		name: "Agustín Covarrubias",
		email: "gloss@agucova.dev",
		username: "agucova",
		isAdmin: true,
	},
	{
		id: seedId("alice"),
		name: "Alice Chen",
		email: "alice@example.com",
		username: "alicechen",
	},
	{
		id: seedId("bob"),
		name: "Bob Martinez",
		email: "bob@example.com",
		username: "bobm",
	},
	{
		id: seedId("carol"),
		name: "Carol Davis",
		email: "carol@example.com",
		username: "carol",
	},
	{
		id: seedId("dan"),
		name: "Dan Wilson",
		email: "dan@example.com",
		username: "danw",
	},
	{
		id: seedId("eve"),
		name: "Eve Johnson",
		email: "eve@example.com",
		username: "evej",
	},
] as const;

const FRIENDSHIPS = [
	// Agucova's friendships
	{ requester: "agucova", addressee: "alice", status: "accepted" as const },
	{ requester: "bob", addressee: "agucova", status: "accepted" as const },
	{ requester: "agucova", addressee: "carol", status: "accepted" as const },
	{ requester: "eve", addressee: "agucova", status: "accepted" as const },
	{ requester: "dan", addressee: "agucova", status: "pending" as const },
	// Other friendships
	{ requester: "alice", addressee: "bob", status: "accepted" as const },
	{ requester: "carol", addressee: "alice", status: "accepted" as const },
	{ requester: "eve", addressee: "bob", status: "accepted" as const },
	{ requester: "carol", addressee: "eve", status: "accepted" as const },
];

const URLS = {
	commonplace: "https://en.wikipedia.org/wiki/Commonplace_book",
	paulgraham: "https://www.paulgraham.com/read.html",
	marginalia: "https://en.wikipedia.org/wiki/Marginalia",
	alignment: "https://www.cold-takes.com/most-important-century/",
	reasoning: "https://gwern.net/scaling-hypothesis",
	zettelkasten: "https://zettelkasten.de/introduction/",
	deepwork:
		"https://calnewport.com/deep-work-rules-for-focused-success-in-a-distracted-world/",
	memex:
		"https://www.theatlantic.com/magazine/archive/1945/07/as-we-may-think/303881/",
	areflect: "https://andymatuschak.org/books/",
	tools: "https://numinous.productions/ttft/",
	spaced:
		"https://www.supermemo.com/en/blog/twenty-rules-of-formulating-knowledge",
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

// Highlight colors - warm pastels as per design spec
const COLORS = {
	yellow: "#FFF3CD",
	peach: "#FFE5D9",
	pink: "#FFD6E0",
	lavender: "#E2D9F3",
	mint: "#D4EDDA",
	sky: "#D1ECF1",
};

const HIGHLIGHTS = [
	// ==========================================================================
	// Agucova's highlights (the main user - lots of activity)
	// ==========================================================================
	{
		id: seedId("hl_ag_01"),
		userId: seedId("agucova"),
		url: URLS.paulgraham,
		text: "Reading about x doesn't just teach you about x; it also teaches you how to write.",
		color: COLORS.yellow,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_ag_02"),
		userId: seedId("agucova"),
		url: URLS.paulgraham,
		text: "You can't think well without writing well, and you can't write well without reading well.",
		color: COLORS.peach,
		visibility: "public" as const,
	},
	{
		id: seedId("hl_ag_03"),
		userId: seedId("agucova"),
		url: URLS.paulgraham,
		text: "There is a kind of thinking that can only be done by writing.",
		color: COLORS.yellow,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_ag_04"),
		userId: seedId("agucova"),
		url: URLS.areflect,
		text: "Books are surprisingly bad at conveying knowledge, and readers mostly don't realize it.",
		color: COLORS.pink,
		visibility: "public" as const,
	},
	{
		id: seedId("hl_ag_05"),
		userId: seedId("agucova"),
		url: URLS.areflect,
		text: "We don't necessarily have to make books work. We can make new forms instead.",
		color: COLORS.lavender,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_ag_06"),
		userId: seedId("agucova"),
		url: URLS.tools,
		text: "Memory is, in fact, a central part of cognition. But the right response to this is not immense amounts of dreary rote memorization.",
		color: COLORS.mint,
		visibility: "public" as const,
	},
	{
		id: seedId("hl_ag_07"),
		userId: seedId("agucova"),
		url: URLS.tools,
		text: "Conceptual mastery is actually enabled by a mastery of details.",
		color: COLORS.sky,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_ag_08"),
		userId: seedId("agucova"),
		url: URLS.alignment,
		text: "the 21st century could be the most important century ever for humanity, via the development of advanced AI systems that could dramatically speed up scientific and technological advancement",
		color: COLORS.peach,
		visibility: "public" as const,
	},
	{
		id: seedId("hl_ag_09"),
		userId: seedId("agucova"),
		url: URLS.alignment,
		text: "we as a civilization are not ready for what's coming, and we need to start by taking it more seriously",
		color: COLORS.pink,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_ag_10"),
		userId: seedId("agucova"),
		url: URLS.zettelkasten,
		text: "A Zettelkasten makes connecting and not collecting a priority.",
		color: COLORS.yellow,
		visibility: "public" as const,
	},
	{
		id: seedId("hl_ag_11"),
		userId: seedId("agucova"),
		url: URLS.deepwork,
		text: "Deep work is like a superpower in our current economy: it enables you to quickly learn complicated new skills and produce high-value output at a high rate.",
		color: COLORS.mint,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_ag_12"),
		userId: seedId("agucova"),
		url: URLS.reasoning,
		text: "the blessings of scale as the secret of AGI: intelligence is 'just' simple neural units & learning algorithms applied to diverse experiences at a (currently) unreachable scale.",
		color: COLORS.lavender,
		visibility: "public" as const,
	},

	// ==========================================================================
	// Alice's highlights (friend)
	// ==========================================================================
	{
		id: seedId("hl_alice_1"),
		userId: seedId("alice"),
		url: URLS.paulgraham,
		text: "Writing is not just a way to convey ideas, but also a way to have them.",
		color: COLORS.peach,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_alice_2"),
		userId: seedId("alice"),
		url: URLS.paulgraham,
		text: "People who just want information may find other ways to get it. But people who want to have ideas can't afford to.",
		color: COLORS.yellow,
		visibility: "public" as const,
	},
	{
		id: seedId("hl_alice_3"),
		userId: seedId("alice"),
		url: URLS.areflect,
		text: "Prose can frame or stimulate readers' thoughts, but prose can't behave or respond to those thoughts as they unfold.",
		color: COLORS.lavender,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_alice_4"),
		userId: seedId("alice"),
		url: URLS.tools,
		text: "the most powerful tools for thought express deep insights into the underlying subject matter",
		color: COLORS.mint,
		visibility: "public" as const,
	},
	{
		id: seedId("hl_alice_5"),
		userId: seedId("alice"),
		url: URLS.zettelkasten,
		text: "The Zettelkasten Method is an amplifier of your endeavors in the realm of knowledge work.",
		color: COLORS.sky,
		visibility: "friends" as const,
	},

	// ==========================================================================
	// Bob's highlights (friend)
	// ==========================================================================
	{
		id: seedId("hl_bob_1"),
		userId: seedId("bob"),
		url: URLS.reasoning,
		text: "hard problems are easier to solve than easy problems---everything gets better as it gets larger",
		color: COLORS.lavender,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_bob_2"),
		userId: seedId("bob"),
		url: URLS.reasoning,
		text: "the final few bits are the most valuable bits, which require the most of what we think of as intelligence",
		color: COLORS.pink,
		visibility: "public" as const,
	},
	{
		id: seedId("hl_bob_3"),
		userId: seedId("bob"),
		url: URLS.alignment,
		text: "if PASTA systems are misaligned - pursuing their own non-human-compatible objectives - things could very quickly go sideways",
		color: COLORS.peach,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_bob_4"),
		userId: seedId("bob"),
		url: URLS.deepwork,
		text: "The Deep Work Hypothesis. Deep work is becoming increasingly valuable at the same time that it's becoming increasingly rare.",
		color: COLORS.yellow,
		visibility: "public" as const,
	},

	// ==========================================================================
	// Carol's highlights (friend)
	// ==========================================================================
	{
		id: seedId("hl_carol_1"),
		userId: seedId("carol"),
		url: URLS.zettelkasten,
		text: "The fixed address of each note is the alpha and omega of the world of Zettelkasten. Everything becomes possible because of it.",
		color: COLORS.mint,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_carol_2"),
		userId: seedId("carol"),
		url: URLS.zettelkasten,
		text: "If you just add links without any explanation you will not create knowledge.",
		color: COLORS.sky,
		visibility: "public" as const,
	},
	{
		id: seedId("hl_carol_3"),
		userId: seedId("carol"),
		url: URLS.areflect,
		text: "It is possible to design new mediums which embody specific ideas about how people think and learn.",
		color: COLORS.lavender,
		visibility: "friends" as const,
	},

	// ==========================================================================
	// Eve's highlights (friend)
	// ==========================================================================
	{
		id: seedId("hl_eve_1"),
		userId: seedId("eve"),
		url: URLS.deepwork,
		text: "Deep work is also an activity that generates a sense of meaning and fulfillment in your professional life.",
		color: COLORS.peach,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_eve_2"),
		userId: seedId("eve"),
		url: URLS.deepwork,
		text: "Few come home energized after an afternoon of frenetic e-mail replies, but the same time spent tackling a hard problem in a quiet location can be immensely satisfying.",
		color: COLORS.yellow,
		visibility: "public" as const,
	},
	{
		id: seedId("hl_eve_3"),
		userId: seedId("eve"),
		url: URLS.tools,
		text: "You need the insight-through-making loop to operate, whereby deep, original insights about the subject feed back to change and improve the system",
		color: COLORS.pink,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_eve_4"),
		userId: seedId("eve"),
		url: URLS.alignment,
		text: "something like PASTA is more likely than not this century",
		color: COLORS.lavender,
		visibility: "public" as const,
	},

	// ==========================================================================
	// Dan's highlights (pending friend request - shouldn't be visible to agucova)
	// ==========================================================================
	{
		id: seedId("hl_dan_1"),
		userId: seedId("dan"),
		url: URLS.paulgraham,
		text: "Reading about x doesn't just teach you about x; it also teaches you how to write.",
		color: COLORS.mint,
		visibility: "friends" as const,
	},
	{
		id: seedId("hl_dan_2"),
		userId: seedId("dan"),
		url: URLS.reasoning,
		text: "neural nets absorb data & compute, generalizing and becoming more Bayesian as problems get harder, manifesting new abilities",
		color: COLORS.sky,
		visibility: "public" as const,
	},
];

const BOOKMARKS = [
	// ==========================================================================
	// Agucova's bookmarks
	// ==========================================================================
	{
		id: seedId("bm_agucova_1"),
		userId: seedId("agucova"),
		url: URLS.paulgraham,
		title: "The Need to Read",
		description: "Paul Graham on why reading is essential for having ideas",
	},
	{
		id: seedId("bm_agucova_2"),
		userId: seedId("agucova"),
		url: URLS.areflect,
		title: "Why Books Don't Work",
		description: "Andy Matuschak on the limitations of books as a medium",
	},
	{
		id: seedId("bm_agucova_3"),
		userId: seedId("agucova"),
		url: URLS.tools,
		title: "How can we develop transformative tools for thought?",
		description: "Matuschak & Nielsen on designing new mediums for thinking",
	},
	{
		id: seedId("bm_agucova_4"),
		userId: seedId("agucova"),
		url: URLS.alignment,
		title: "The Most Important Century",
		description: "Holden Karnofsky's series on AI and the future",
	},
	{
		id: seedId("bm_agucova_5"),
		userId: seedId("agucova"),
		url: URLS.reasoning,
		title: "The Scaling Hypothesis",
		description: "Gwern on why neural network scaling might be enough for AGI",
	},
	{
		id: seedId("bm_agucova_6"),
		userId: seedId("agucova"),
		url: URLS.zettelkasten,
		title: "Introduction to the Zettelkasten Method",
		description: "The linking note-taking system Luhmann used",
	},
	{
		id: seedId("bm_agucova_7"),
		userId: seedId("agucova"),
		url: URLS.deepwork,
		title: "Deep Work",
		description: "Cal Newport on focused work in a distracted world",
	},

	// ==========================================================================
	// Alice's bookmarks
	// ==========================================================================
	{
		id: seedId("bm_alice_1"),
		userId: seedId("alice"),
		url: URLS.paulgraham,
		title: "The Need to Read",
		description: "Paul Graham on reading and learning",
	},
	{
		id: seedId("bm_alice_2"),
		userId: seedId("alice"),
		url: URLS.zettelkasten,
		title: "Zettelkasten Introduction",
		description: "Note-taking methodology",
	},
	{
		id: seedId("bm_alice_3"),
		userId: seedId("alice"),
		url: URLS.tools,
		title: "Tools for Thought",
		description: "Essay on cognitive tools",
	},

	// ==========================================================================
	// Bob's bookmarks
	// ==========================================================================
	{
		id: seedId("bm_bob_1"),
		userId: seedId("bob"),
		url: URLS.reasoning,
		title: "The Scaling Hypothesis",
		description: "On neural network scaling laws",
	},
	{
		id: seedId("bm_bob_2"),
		userId: seedId("bob"),
		url: URLS.alignment,
		title: "Most Important Century",
		description: null,
	},
	{
		id: seedId("bm_bob_3"),
		userId: seedId("bob"),
		url: URLS.deepwork,
		title: "Deep Work - Cal Newport",
		description: "Focus and productivity",
	},

	// ==========================================================================
	// Carol's bookmarks
	// ==========================================================================
	{
		id: seedId("bm_carol_1"),
		userId: seedId("carol"),
		url: URLS.zettelkasten,
		title: "Zettelkasten Method",
		description: "How to build a second brain",
	},
	{
		id: seedId("bm_carol_2"),
		userId: seedId("carol"),
		url: URLS.areflect,
		title: "Why Books Don't Work",
		description: "Rethinking how we learn from text",
	},

	// ==========================================================================
	// Eve's bookmarks
	// ==========================================================================
	{
		id: seedId("bm_eve_1"),
		userId: seedId("eve"),
		url: URLS.deepwork,
		title: "Deep Work",
		description: "The value of focused work",
	},
	{
		id: seedId("bm_eve_2"),
		userId: seedId("eve"),
		url: URLS.tools,
		title: "Transformative Tools for Thought",
		description: "Matuschak and Nielsen's exploration",
	},
];

// =============================================================================
// Comments on highlights (marginalia)
// =============================================================================
const COMMENTS = [
	// Comments on agucova's highlights
	{
		id: seedId("cm_alice_on_ag04"),
		highlightId: seedId("hl_ag_04"),
		authorId: seedId("alice"),
		content:
			"This is exactly why I've been experimenting with spaced repetition embedded in articles. The medium itself needs to change.",
	},
	{
		id: seedId("cm_bob_on_ag08"),
		highlightId: seedId("hl_ag_08"),
		authorId: seedId("bob"),
		content:
			"Holden's framing here is interesting but I think he undersells the coordination challenges. Even if we solve alignment technically, governance is a whole other problem.",
	},
	{
		id: seedId("cm_ag_reply_01"),
		highlightId: seedId("hl_ag_08"),
		authorId: seedId("agucova"),
		parentId: seedId("cm_bob_on_ag08"),
		content:
			"Agree - I think the governance piece is where a lot of my work at Kairos is focused. Technical alignment is necessary but not sufficient.",
	},
	{
		id: seedId("cm_carol_on_ag10"),
		highlightId: seedId("hl_ag_10"),
		authorId: seedId("carol"),
		content:
			"This principle transformed how I take notes. Before I was just hoarding quotes, now every note has to connect to something.",
	},
	{
		id: seedId("cm_eve_on_ag11"),
		highlightId: seedId("hl_ag_11"),
		authorId: seedId("eve"),
		content:
			"Deep work has been huge for my research output. The hard part is protecting the time.",
	},

	// Comments on friends' highlights
	{
		id: seedId("cm_agucova_on_al1"),
		highlightId: seedId("hl_alice_1"),
		authorId: seedId("agucova"),
		content:
			"This connects nicely to the Feynman technique - teaching forces you to clarify your thinking.",
	},
	{
		id: seedId("cm_agucova_on_bo1"),
		highlightId: seedId("hl_bob_1"),
		authorId: seedId("agucova"),
		content:
			"The bitter lesson! Sutton made this point years ago but it keeps getting validated.",
	},
	{
		id: seedId("cm_alice_on_ca1"),
		highlightId: seedId("hl_carol_1"),
		authorId: seedId("alice"),
		content:
			"Have you tried Obsidian for this? The bidirectional links make it feel very Zettelkasten-native.",
	},
	{
		id: seedId("cm_carol_reply1"),
		highlightId: seedId("hl_carol_1"),
		authorId: seedId("carol"),
		parentId: seedId("cm_alice_on_ca1"),
		content:
			"Yes! Been using it for about a year now. The graph view is addictive but I try not to let it become a distraction.",
	},
];

// =============================================================================
// Tags for bookmarks
// =============================================================================
const TAGS = [
	// Agucova's tags
	{
		id: seedId("tag_ag_reading"),
		userId: seedId("agucova"),
		name: "reading",
		color: "#FFE4B5",
	},
	{
		id: seedId("tag_ag_ai"),
		userId: seedId("agucova"),
		name: "ai-safety",
		color: "#E6E6FA",
	},
	{
		id: seedId("tag_ag_pkm"),
		userId: seedId("agucova"),
		name: "pkm",
		color: "#98FB98",
	},
	{
		id: seedId("tag_ag_prod"),
		userId: seedId("agucova"),
		name: "productivity",
		color: "#ADD8E6",
	},

	// Alice's tags
	{
		id: seedId("tag_al_notes"),
		userId: seedId("alice"),
		name: "note-taking",
		color: "#FFB6C1",
	},
	{
		id: seedId("tag_al_learn"),
		userId: seedId("alice"),
		name: "learning",
		color: "#FFFACD",
	},

	// Bob's tags
	{
		id: seedId("tag_bo_ml"),
		userId: seedId("bob"),
		name: "machine-learning",
		color: "#E6E6FA",
	},
	{
		id: seedId("tag_bo_focus"),
		userId: seedId("bob"),
		name: "focus",
		color: "#FFE4B5",
	},
];

// Bookmark-tag associations
const BOOKMARK_TAGS = [
	// Agucova's bookmark tags
	{
		id: seedId("bt_ag1_read"),
		bookmarkId: seedId("bm_agucova_1"),
		tagId: seedId("tag_ag_reading"),
	},
	{
		id: seedId("bt_ag2_read"),
		bookmarkId: seedId("bm_agucova_2"),
		tagId: seedId("tag_ag_reading"),
	},
	{
		id: seedId("bt_ag2_pkm"),
		bookmarkId: seedId("bm_agucova_2"),
		tagId: seedId("tag_ag_pkm"),
	},
	{
		id: seedId("bt_ag3_pkm"),
		bookmarkId: seedId("bm_agucova_3"),
		tagId: seedId("tag_ag_pkm"),
	},
	{
		id: seedId("bt_ag4_ai"),
		bookmarkId: seedId("bm_agucova_4"),
		tagId: seedId("tag_ag_ai"),
	},
	{
		id: seedId("bt_ag5_ai"),
		bookmarkId: seedId("bm_agucova_5"),
		tagId: seedId("tag_ag_ai"),
	},
	{
		id: seedId("bt_ag6_pkm"),
		bookmarkId: seedId("bm_agucova_6"),
		tagId: seedId("tag_ag_pkm"),
	},
	{
		id: seedId("bt_ag7_prod"),
		bookmarkId: seedId("bm_agucova_7"),
		tagId: seedId("tag_ag_prod"),
	},

	// Alice's bookmark tags
	{
		id: seedId("bt_al1_learn"),
		bookmarkId: seedId("bm_alice_1"),
		tagId: seedId("tag_al_learn"),
	},
	{
		id: seedId("bt_al2_notes"),
		bookmarkId: seedId("bm_alice_2"),
		tagId: seedId("tag_al_notes"),
	},
	{
		id: seedId("bt_al3_learn"),
		bookmarkId: seedId("bm_alice_3"),
		tagId: seedId("tag_al_learn"),
	},

	// Bob's bookmark tags
	{
		id: seedId("bt_bo1_ml"),
		bookmarkId: seedId("bm_bob_1"),
		tagId: seedId("tag_bo_ml"),
	},
	{
		id: seedId("bt_bo2_ml"),
		bookmarkId: seedId("bm_bob_2"),
		tagId: seedId("tag_bo_ml"),
	},
	{
		id: seedId("bt_bo3_focus"),
		bookmarkId: seedId("bm_bob_3"),
		tagId: seedId("tag_bo_focus"),
	},
];

// =============================================================================
// Seed Functions
// =============================================================================

async function clearSeedData() {
	console.log("Clearing existing seed data...");

	// Build list of all seed user emails for clearing existing data
	const seedEmails = USERS.map((u) => u.email);

	// Delete in reverse dependency order
	// First clear seed-prefixed data
	await db.delete(bookmarkTag).where(like(bookmarkTag.id, "seed_%"));
	await db.delete(tag).where(like(tag.id, "seed_%"));
	await db.delete(comment).where(like(comment.id, "seed_%"));
	await db.delete(highlight).where(like(highlight.id, "seed_%"));
	await db.delete(bookmark).where(like(bookmark.id, "seed_%"));
	await db.delete(friendship).where(like(friendship.id, "seed_%"));
	await db.delete(account).where(like(account.id, "seed_%"));
	await db.delete(user).where(like(user.id, "seed_%"));

	// Also clear any existing users with the same emails (in case they exist from real usage)
	for (const email of seedEmails) {
		// Find user by email first
		const existingUsers = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, email));

		for (const u of existingUsers) {
			// Delete related data first (cascades should handle most, but be safe)
			await db.delete(account).where(eq(account.userId, u.id));
			await db.delete(user).where(eq(user.id, u.id));
		}
	}

	console.log("  Cleared.");
}

async function seedUsers() {
	console.log("Seeding users...");
	const passwordHash = await hashPassword("password123");

	for (const u of USERS) {
		const isAdmin = "isAdmin" in u && u.isAdmin;
		await db.insert(user).values({
			id: u.id,
			name: u.name,
			email: u.email,
			emailVerified: true,
			role: isAdmin ? "admin" : "user",
			username: u.username,
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
			selector: createSelector(h.text),
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

async function seedComments() {
	console.log("Seeding comments...");

	for (const c of COMMENTS) {
		await db.insert(comment).values({
			id: c.id,
			highlightId: c.highlightId,
			authorId: c.authorId,
			parentId: "parentId" in c ? c.parentId : null,
			content: c.content,
		});
	}

	console.log(`  Created ${COMMENTS.length} comments.`);
}

async function seedTags() {
	console.log("Seeding tags...");

	for (const t of TAGS) {
		await db.insert(tag).values({
			id: t.id,
			userId: t.userId,
			name: t.name,
			color: t.color,
		});
	}

	console.log(`  Created ${TAGS.length} tags.`);
}

async function seedBookmarkTags() {
	console.log("Seeding bookmark tags...");

	for (const bt of BOOKMARK_TAGS) {
		await db.insert(bookmarkTag).values({
			id: bt.id,
			bookmarkId: bt.bookmarkId,
			tagId: bt.tagId,
		});
	}

	console.log(`  Created ${BOOKMARK_TAGS.length} bookmark-tag associations.`);
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
	await seedComments();
	await seedBookmarks();
	await seedTags();
	await seedBookmarkTags();

	console.log("\n=== Seed Complete ===");
	console.log("\nTest accounts (all use password: password123):");
	for (const u of USERS) {
		console.log(`  - ${u.email} (@${u.username})`);
	}
	console.log("\nAgucova has 4 accepted friends: Alice, Bob, Carol, Eve");
	console.log("Dan has a pending friend request to Agucova");
	console.log("");

	process.exit(0);
}

main().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
