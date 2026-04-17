/**
 * Curius page-load bridge. Fetches friends' highlights for a URL directly from
 * curius.app (extension-side, no Convex hop) and merges them into the content
 * script's rendering path alongside native Gloss highlights.
 *
 * Architecture notes:
 * - Zero tax for non-connected users: if no JWT is cached, we return empty
 *   immediately without hitting Convex or Curius.
 * - Rate-limited token bucket protects Curius (and the user's JWT) from
 *   20-tabs-at-once bursts.
 * - Three caches keep per-page latency low:
 *   - per-URL payload cache (5 min, LRU 500) in `chrome.storage.local`
 *   - following-list cache (1h, invalidated on resync / TOKEN_REVOKED)
 *   - mapping-lookup cache (5 min) for Gloss profile hydration
 * - CuriusAuthError anywhere in the pipeline clears the cached token so the
 *   popup can surface a reconnect CTA.
 */

import type { NetworkInfo } from "@gloss/curius";

import { CuriusAuthError, CuriusClient } from "@gloss/curius";

import { api, getConvexClient } from "./api";
import { hashUrl } from "./url";

// ============================================================================
// Storage keys and constants
// ============================================================================

const TOKEN_KEY = "curius.token";
/**
 * Presence gate for the opportunistic JWT heartbeat. Set on successful
 * `setCredentials`, cleared on disconnect or 401. The content script on
 * curius.app uses this (via local storage) as the single "should I push a
 * fresh JWT up?" signal — without it, heartbeats from random pages are
 * silently dropped.
 */
const CONNECTED_KEY = "curius.connectedAt";
const FOLLOWING_CACHE_KEY = "curius.followingCache";
const URL_CACHE_KEY = "curius.urlCache";
const MAPPING_CACHE_KEY = "curius.mappingCache";

const URL_CACHE_TTL_MS = 5 * 60 * 1000;
const URL_CACHE_MAX_ENTRIES = 500;
const FOLLOWING_CACHE_TTL_MS = 60 * 60 * 1000;
const MAPPING_CACHE_TTL_MS = 5 * 60 * 1000;

const RATE_LIMIT_CAPACITY = 10;
const RATE_LIMIT_REFILL_PER_SEC = 5;

// ============================================================================
// Types
// ============================================================================

export interface BridgeHighlight {
	externalId: string;
	text: string;
	selector: {
		quote: {
			type: "TextQuoteSelector";
			exact: string;
			prefix: string;
			suffix: string;
		};
	};
	url: string;
	user: {
		firstName: string;
		lastName: string;
		curiusUserLink: string | undefined;
		curiusUserId: string;
		glossUserId: string | undefined;
	};
	source: "curius";
}

interface UrlCacheEntry {
	fetchedAt: number;
	payload: BridgeHighlight[];
}

interface FollowingCacheEntry {
	fetchedAt: number;
	userIds: string[];
}

interface MappingCacheEntry {
	fetchedAt: number;
	glossUserId: string | undefined;
	firstName: string;
	lastName: string;
	curiusUsername: string;
}

// ============================================================================
// Token bucket rate limiter (in-memory; per service-worker lifetime)
// ============================================================================

let bucketTokens = RATE_LIMIT_CAPACITY;
let bucketLastRefillMs = Date.now();

function refillBucket(): void {
	const now = Date.now();
	const elapsedSec = (now - bucketLastRefillMs) / 1000;
	const added = elapsedSec * RATE_LIMIT_REFILL_PER_SEC;
	bucketTokens = Math.min(RATE_LIMIT_CAPACITY, bucketTokens + added);
	bucketLastRefillMs = now;
}

function tryConsumeBucket(): boolean {
	refillBucket();
	if (bucketTokens >= 1) {
		bucketTokens -= 1;
		return true;
	}
	return false;
}

/**
 * Test-only helper: reset the module-level rate-limiter state between
 * tests. Module-level `let` bindings otherwise leak across test cases.
 */
export function _resetRateLimiterForTests(
	capacity = RATE_LIMIT_CAPACITY
): void {
	bucketTokens = capacity;
	bucketLastRefillMs = Date.now();
}

// ============================================================================
// Storage helpers
// ============================================================================

async function getToken(): Promise<string | null> {
	const stored = await browser.storage.sync.get(TOKEN_KEY);
	const token = stored[TOKEN_KEY];
	return typeof token === "string" && token.length > 0 ? token : null;
}

export async function setToken(token: string): Promise<void> {
	await browser.storage.sync.set({ [TOKEN_KEY]: token });
}

export async function clearToken(): Promise<void> {
	await browser.storage.sync.remove(TOKEN_KEY);
	await browser.storage.local.remove([
		FOLLOWING_CACHE_KEY,
		URL_CACHE_KEY,
		MAPPING_CACHE_KEY,
		CONNECTED_KEY,
	]);
}

/**
 * Mark the user as actively connected to Curius. Called after
 * `setCredentials` succeeds. Enables the content-script heartbeat on
 * curius.app tabs.
 */
export async function markCuriusConnected(): Promise<void> {
	await browser.storage.local.set({ [CONNECTED_KEY]: Date.now() });
}

export async function isCuriusConnected(): Promise<boolean> {
	const stored = await browser.storage.local.get(CONNECTED_KEY);
	return typeof stored[CONNECTED_KEY] === "number";
}

/** Read the stored token without exposing the key name to other modules. */
export async function getStoredToken(): Promise<string | null> {
	return await getToken();
}

/**
 * Invalidate the caches that change with the user's Curius social graph.
 * Called on explicit re-sync and on TOKEN_REVOKED from the web side.
 */
export async function invalidateSocialCaches(): Promise<void> {
	await browser.storage.local.remove([
		FOLLOWING_CACHE_KEY,
		URL_CACHE_KEY,
		MAPPING_CACHE_KEY,
	]);
}

// ============================================================================
// Per-URL cache (LRU by fetchedAt)
// ============================================================================

async function readUrlCache(): Promise<Record<string, UrlCacheEntry>> {
	const stored = await browser.storage.local.get(URL_CACHE_KEY);
	const value = stored[URL_CACHE_KEY];
	return (value as Record<string, UrlCacheEntry>) ?? {};
}

async function writeUrlCache(
	cache: Record<string, UrlCacheEntry>
): Promise<void> {
	await browser.storage.local.set({ [URL_CACHE_KEY]: cache });
}

async function getCachedUrl(
	urlHash: string
): Promise<BridgeHighlight[] | null> {
	const cache = await readUrlCache();
	const entry = cache[urlHash];
	if (!entry) return null;
	if (Date.now() - entry.fetchedAt > URL_CACHE_TTL_MS) return null;
	return entry.payload;
}

async function setCachedUrl(
	urlHash: string,
	payload: BridgeHighlight[]
): Promise<void> {
	const cache = await readUrlCache();
	cache[urlHash] = { fetchedAt: Date.now(), payload };

	// LRU eviction by oldest fetchedAt.
	const entries = Object.entries(cache);
	if (entries.length > URL_CACHE_MAX_ENTRIES) {
		entries.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
		const toKeep = entries.slice(entries.length - URL_CACHE_MAX_ENTRIES);
		const trimmed: Record<string, UrlCacheEntry> = {};
		for (const [k, v] of toKeep) trimmed[k] = v;
		await writeUrlCache(trimmed);
		return;
	}

	await writeUrlCache(cache);
}

// ============================================================================
// Following cache
// ============================================================================

async function getCachedFollowing(client: CuriusClient): Promise<Set<string>> {
	const stored = await browser.storage.local.get(FOLLOWING_CACHE_KEY);
	const entry = stored[FOLLOWING_CACHE_KEY] as FollowingCacheEntry | undefined;
	if (entry && Date.now() - entry.fetchedAt < FOLLOWING_CACHE_TTL_MS) {
		return new Set(entry.userIds);
	}

	const following = await client.getFollowing();
	const userIds = following.map((u) => u.id);
	await browser.storage.local.set({
		[FOLLOWING_CACHE_KEY]: {
			fetchedAt: Date.now(),
			userIds,
		} satisfies FollowingCacheEntry,
	});
	return new Set(userIds);
}

// ============================================================================
// Mapping-lookup cache
// ============================================================================

async function hydrateMappings(
	curiusUserIds: string[]
): Promise<Map<string, MappingCacheEntry>> {
	const stored = await browser.storage.local.get(MAPPING_CACHE_KEY);
	const cache =
		(stored[MAPPING_CACHE_KEY] as Record<string, MappingCacheEntry>) ?? {};

	const now = Date.now();
	const fresh = new Map<string, MappingCacheEntry>();
	const stale: string[] = [];

	for (const id of curiusUserIds) {
		const entry = cache[id];
		if (entry && now - entry.fetchedAt < MAPPING_CACHE_TTL_MS) {
			fresh.set(id, entry);
		} else {
			stale.push(id);
		}
	}

	if (stale.length > 0) {
		const client = getConvexClient();
		const result = await client.query(api.curius.getMappingsByCuriusIds, {
			curiusUserIds: stale,
		});
		for (const id of stale) {
			const row = result[id];
			if (!row) continue;
			const entry: MappingCacheEntry = {
				fetchedAt: now,
				glossUserId: row.glossUserId,
				firstName: row.firstName,
				lastName: row.lastName,
				curiusUsername: row.curiusUsername,
			};
			cache[id] = entry;
			fresh.set(id, entry);
		}
		await browser.storage.local.set({ [MAPPING_CACHE_KEY]: cache });
	}

	return fresh;
}

// ============================================================================
// Main bridge handler
// ============================================================================

function shapeBridgeHighlights(
	info: NetworkInfo,
	following: Set<string>,
	mappings: Map<string, MappingCacheEntry>,
	url: string
): BridgeHighlight[] {
	const out: BridgeHighlight[] = [];

	// `info.highlights` is an array of arrays — one per user on the page. The
	// schema transforms userId to string, so comparison against the Set works.
	for (const group of info.highlights) {
		for (const hl of group) {
			if (!following.has(hl.userId)) continue;
			const mapping = mappings.get(hl.userId);

			// Prefer schema-transformed quote fields; fall back gracefully.
			const exact = hl.rawHighlight ?? hl.highlight;
			if (!exact) continue;

			const externalId = hl.id;
			const firstName = mapping?.firstName ?? hl.user?.firstName ?? "Unknown";
			const lastName = mapping?.lastName ?? hl.user?.lastName ?? "";
			const curiusUserLink =
				mapping?.curiusUsername ?? hl.user?.userLink ?? undefined;

			out.push({
				externalId,
				text: exact,
				selector: {
					quote: {
						type: "TextQuoteSelector",
						exact,
						prefix: hl.leftContext ?? "",
						suffix: hl.rightContext ?? "",
					},
				},
				url,
				user: {
					firstName,
					lastName,
					curiusUserLink,
					curiusUserId: hl.userId,
					glossUserId: mapping?.glossUserId,
				},
				source: "curius",
			});
		}
	}

	return out;
}

export async function handleLoadCuriusBridge(
	url: string
): Promise<{ highlights: BridgeHighlight[] }> {
	const token = await getToken();
	if (!token) {
		// Native-only-user fast path: no Curius call, no Convex call.
		return { highlights: [] };
	}

	let urlHash: string;
	try {
		urlHash = await hashUrl(url);
	} catch {
		// Malformed URL (e.g., `about:blank`) — skip silently.
		return { highlights: [] };
	}

	const cached = await getCachedUrl(urlHash);
	if (cached) {
		return { highlights: cached };
	}

	if (!tryConsumeBucket()) {
		// Tab-burst storm: skip this call entirely rather than queue. Native
		// highlights are unaffected; the bridge just misses on one page.
		return { highlights: [] };
	}

	const client = new CuriusClient({ token });

	try {
		const info = await client.getNetworkInfo(url);
		if (!info) {
			await setCachedUrl(urlHash, []);
			return { highlights: [] };
		}

		const following = await getCachedFollowing(client);
		const relevantAuthors = new Set<string>();
		for (const group of info.highlights) {
			for (const hl of group) {
				if (following.has(hl.userId)) relevantAuthors.add(hl.userId);
			}
		}

		const mappings = await hydrateMappings(Array.from(relevantAuthors));
		const highlights = shapeBridgeHighlights(info, following, mappings, url);

		await setCachedUrl(urlHash, highlights);
		return { highlights };
	} catch (error) {
		if (error instanceof CuriusAuthError) {
			console.warn(
				"[Gloss] Curius token rejected; clearing cached credentials."
			);
			await clearToken();
			return { highlights: [] };
		}
		console.warn("[Gloss] Curius bridge failed:", error);
		return { highlights: [] };
	}
}
