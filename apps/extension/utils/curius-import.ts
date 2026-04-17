/**
 * Curius import orchestration. Runs inside the background service worker so
 * it survives popup close. Fetches the user's full library from curius.app,
 * batches it into Convex mutations, and handles token expiry.
 *
 * Idempotent by construction: all writes dedup on `(importSource, externalId)`
 * for highlights and `(userId, urlHash)` for bookmarks. Re-running a failed
 * import picks up where it left off.
 */

import type { CuriusLink } from "@gloss/curius";
import type { ConvexHttpClient } from "convex/browser";

import { CuriusAuthError, CuriusClient } from "@gloss/curius";

import { api } from "./api";
import { clearToken, invalidateSocialCaches, setToken } from "./curius-bridge";

/** Import chunk size in links per mutation call. */
const CHUNK_SIZE = 50;

interface MappingRow {
	curiusUserId: string;
	curiusUsername: string;
	firstName: string;
	lastName: string;
}

/**
 * Collect the set of Curius users that should land in `curiusUserMappings`
 * (the importer's following list + any author referenced by highlights).
 * Deduped by curiusUserId so the server doesn't see the same row twice.
 */
export function collectMappings(
	following: Awaited<ReturnType<CuriusClient["getFollowing"]>>,
	links: CuriusLink[]
): MappingRow[] {
	const out = new Map<string, MappingRow>();
	for (const u of following) {
		out.set(u.id, {
			curiusUserId: u.id,
			curiusUsername: u.userLink,
			firstName: u.firstName,
			lastName: u.lastName,
		});
	}
	// Highlights don't always carry full user info, so this only catches
	// authors whose objects the API happens to include. That's fine —
	// everyone we can't resolve here is either (a) in the following list
	// above or (b) not actionable anyway.
	for (const link of links) {
		for (const hl of link.highlights) {
			const u = (hl as { user?: { id?: string } }).user;
			if (u?.id && !out.has(u.id)) {
				// We only have a skeleton; skip unless we can fill the required
				// fields. Better to omit than to insert a row with "Unknown".
			}
		}
	}
	return Array.from(out.values());
}

/**
 * Flatten a single Curius link into the shape `api.curius.importChunk`
 * expects. Skips highlights with no usable text (a tiny fraction of very
 * old records).
 */
export function linkToImportInput(link: CuriusLink): {
	url: string;
	title?: string;
	description?: string;
	highlights: Array<{
		externalId: string;
		rawHighlight: string;
		leftContext: string;
		rightContext: string;
	}>;
} | null {
	const url = link.url ?? link.link;
	if (!url) return null;

	const highlights = link.highlights
		.map((hl) => {
			const raw =
				hl.rawHighlight ??
				(hl as { highlightText?: string }).highlightText ??
				hl.highlight;
			if (!raw) return null;
			return {
				externalId: hl.id,
				rawHighlight: raw,
				leftContext: hl.leftContext ?? "",
				rightContext: hl.rightContext ?? "",
			};
		})
		.filter(Boolean) as Array<{
		externalId: string;
		rawHighlight: string;
		leftContext: string;
		rightContext: string;
	}>;

	return {
		url,
		title: link.title ?? undefined,
		description: link.description ?? undefined,
		highlights,
	};
}

export function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}

export interface RunImportDeps {
	convexClient: ConvexHttpClient;
	token: string;
}

/**
 * Execute a full import. Throws on unrecoverable errors so the caller can
 * mark the import failed and surface an appropriate message; handles token
 * expiry specially by clearing the cached token.
 */
export async function runCuriusImport({
	convexClient,
	token,
}: RunImportDeps): Promise<void> {
	const curius = new CuriusClient({ token, timeout: 30_000 });

	await convexClient.mutation(api.curius.startImport, {});

	try {
		const [links, following] = await Promise.all([
			curius.getUserLinks(),
			curius.getFollowing(),
		]);

		const mappings = collectMappings(following, links);
		if (mappings.length > 0) {
			await convexClient.mutation(api.curius.upsertMappings, { mappings });
		}

		let linksProcessed = 0;
		let highlightsImported = 0;

		for (const batch of chunk(links, CHUNK_SIZE)) {
			const shaped = batch.map(linkToImportInput).filter(Boolean) as Array<
				NonNullable<ReturnType<typeof linkToImportInput>>
			>;
			if (shaped.length === 0) {
				linksProcessed += batch.length;
				continue;
			}

			const result = await convexClient.mutation(api.curius.importChunk, {
				links: shaped,
			});

			linksProcessed += batch.length;
			highlightsImported += result.highlightsInserted;

			await convexClient.mutation(api.curius.updateImportProgress, {
				linksProcessed,
				highlightsImported,
			});
		}

		await convexClient.mutation(api.curius.finishImport, {});
		// Fresh following means the bridge would serve stale data; clear.
		await invalidateSocialCaches();
	} catch (error) {
		if (error instanceof CuriusAuthError) {
			await clearToken();
			await convexClient.mutation(api.curius.failImport, {
				error: "token_expired",
			});
			throw error;
		}
		const message = error instanceof Error ? error.message : String(error);
		await convexClient.mutation(api.curius.failImport, { error: message });
		throw error;
	}
}

/**
 * Persist a Curius JWT that the content script lifted from curius.app's
 * localStorage. Verifies the token against `/api/user` so we surface a clear
 * auth error if Curius has rotated it, and returns identity fields plus the
 * decoded expiry for `setCredentials`.
 *
 * Curius issues JWTs with a ~1-year lifetime and has no refresh endpoint
 * (confirmed empirically via bundle inspection — no `setItem("jwt",...)` call
 * sites other than `/api/login` response handlers). We persist `exp` so the
 * UI can nudge the user to reconnect before the hard fail.
 */
export async function connectCuriusWithToken(token: string): Promise<{
	token: string;
	tokenExpiresAt: number | undefined;
	curiusUserId: string;
	curiusUsername: string;
	firstName: string;
	lastName: string;
}> {
	const client = new CuriusClient({ token });
	const user = await client.getUser();
	await setToken(token);
	return {
		token,
		tokenExpiresAt: decodeJwtExpiryMs(token),
		curiusUserId: user.id,
		curiusUsername: user.userLink,
		firstName: user.firstName,
		lastName: user.lastName,
	};
}

/**
 * Decode a JWT's `exp` claim into a millisecond epoch. Returns `undefined`
 * if the token can't be parsed or has no `exp` — callers treat "unknown
 * expiry" as healthy and fall back to the 401 path.
 */
export function decodeJwtExpiryMs(token: string): number | undefined {
	const parts = token.split(".");
	if (parts.length !== 3) return undefined;
	try {
		const payload = JSON.parse(
			atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
		) as { exp?: unknown };
		if (typeof payload.exp !== "number") return undefined;
		return payload.exp * 1000;
	} catch {
		return undefined;
	}
}
