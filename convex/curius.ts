import { v } from "convex/values";

import type { MutationCtx } from "./_generated/server";

import { mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { hashUrl, normalizeUrl } from "./lib/url";

/**
 * Any `lastImportStatus === "running"` row whose `lastImportStartedAt` is older
 * than this is treated as abandoned (extension tab closed mid-import, network
 * died, etc.). The UI surfaces it as "stalled" and the next startImport call
 * sweeps it.
 */
const STALLED_IMPORT_MS = 15 * 60 * 1000;

/**
 * Store (or replace) the user's Curius JWT plus identity fields returned by
 * `client.login` + `client.getUser`. Also upserts the user's own row into
 * `curiusUserMappings` with `glossUserId` pointed at themselves, so bridge
 * queries and importers can treat the current user symmetrically with every
 * other Curius identity they encounter.
 *
 * The token is obtained by the extension via `POST curius.app/api/login`; it
 * never traverses Convex. We only persist the resulting JWT.
 */
export const setCredentials = mutation({
	args: {
		token: v.string(),
		curiusUserId: v.string(),
		curiusUsername: v.string(),
		firstName: v.string(),
		lastName: v.string(),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const now = Date.now();

		const existing = await ctx.db
			.query("curiusCredentials")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				token: args.token,
				curiusUserId: args.curiusUserId,
				curiusUsername: args.curiusUsername,
				lastVerifiedAt: now,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert("curiusCredentials", {
				userId,
				token: args.token,
				curiusUserId: args.curiusUserId,
				curiusUsername: args.curiusUsername,
				lastVerifiedAt: now,
				updatedAt: now,
			});
		}

		const existingMapping = await ctx.db
			.query("curiusUserMappings")
			.withIndex("by_curiusUserId", (q) =>
				q.eq("curiusUserId", args.curiusUserId)
			)
			.first();

		if (existingMapping) {
			// Always point the mapping at the current Gloss user — if someone
			// else was previously linked to this Curius ID, the latest connect
			// wins (which matches the semantics of "whoever can authenticate as
			// this Curius account owns the mapping").
			await ctx.db.patch(existingMapping._id, {
				glossUserId: userId,
				curiusUsername: args.curiusUsername,
				firstName: args.firstName,
				lastName: args.lastName,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert("curiusUserMappings", {
				curiusUserId: args.curiusUserId,
				curiusUsername: args.curiusUsername,
				firstName: args.firstName,
				lastName: args.lastName,
				glossUserId: userId,
				updatedAt: now,
			});
		}
	},
});

/**
 * Forget the user's Curius connection. Imported highlights stay — they're the
 * user's data now, regardless of whether the Curius account is still linked.
 * The user's own `curiusUserMappings` row is also left intact so bridge
 * queries from other users still know who they are.
 */
export const disconnect = mutation({
	args: {},
	handler: async (ctx) => {
		const { userId } = await requireAuth(ctx);

		const existing = await ctx.db
			.query("curiusCredentials")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.first();

		if (existing) {
			await ctx.db.delete(existing._id);
		}
	},
});

/**
 * UI-facing status query for the popup and the web settings Curius section.
 * Returns a derived `lastImportStatus` of `"stalled"` when a running import
 * has been silent past {@link STALLED_IMPORT_MS} — callers can show a "retry"
 * affordance without needing to know the sweep threshold.
 */
export const getConnectionStatus = query({
	args: {},
	handler: async (ctx) => {
		const { userId } = await requireAuth(ctx);

		const row = await ctx.db
			.query("curiusCredentials")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.first();

		if (!row) {
			return {
				connected: false as const,
			};
		}

		const storedStatus = row.lastImportStatus;
		const startedAt = row.lastImportStartedAt;
		const isStalled =
			storedStatus === "running" &&
			typeof startedAt === "number" &&
			Date.now() - startedAt > STALLED_IMPORT_MS;

		return {
			connected: true as const,
			curiusUsername: row.curiusUsername,
			lastVerifiedAt: row.lastVerifiedAt,
			lastImportStatus: isStalled ? ("stalled" as const) : storedStatus,
			lastImportStartedAt: row.lastImportStartedAt,
			lastImportFinishedAt: row.lastImportFinishedAt,
			lastImportError: row.lastImportError,
			linksProcessed: row.linksProcessed,
			highlightsImported: row.highlightsImported,
		};
	},
});

/**
 * Read the current user's JWT + Curius user ID. Consumed by the extension
 * background script on startup to rehydrate its local cache. Returns null if
 * the user isn't connected to Curius.
 */
export const getCredentialsForExtension = query({
	args: {},
	handler: async (ctx) => {
		const { userId } = await requireAuth(ctx);

		const row = await ctx.db
			.query("curiusCredentials")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.first();

		if (!row) return null;

		return {
			token: row.token,
			curiusUserId: row.curiusUserId,
			curiusUsername: row.curiusUsername,
		};
	},
});

// ============================================================================
// Import mutations
// ============================================================================

/**
 * Read a user's credentials row or throw. Used by all import mutations so a
 * half-authenticated caller (session but never connected to Curius) gets a
 * clear error instead of a silent no-op.
 */
async function getCredentialsRowOrThrow(ctx: MutationCtx) {
	const { userId } = await requireAuth(ctx);
	const row = await ctx.db
		.query("curiusCredentials")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.first();
	if (!row) {
		throw new Error("Not connected to Curius");
	}
	return { userId, row };
}

/**
 * Begin an import run. Sets the status to "running" and zeroes counters.
 * Concurrent imports are allowed (dedup via `by_importSource_externalId`
 * makes them safe); this call always overwrites, which also sweeps any
 * previously-stalled "running" status left behind by a closed tab.
 */
export const startImport = mutation({
	args: {},
	handler: async (ctx) => {
		const { row } = await getCredentialsRowOrThrow(ctx);
		await ctx.db.patch(row._id, {
			lastImportStatus: "running",
			lastImportStartedAt: Date.now(),
			lastImportFinishedAt: undefined,
			lastImportError: undefined,
			linksProcessed: 0,
			highlightsImported: 0,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Incremental progress report from the extension between chunks. Counter
 * values are cumulative totals, not deltas — the extension tracks the running
 * counts and sends them as it goes, which keeps this mutation idempotent.
 */
export const updateImportProgress = mutation({
	args: {
		linksProcessed: v.number(),
		highlightsImported: v.number(),
	},
	handler: async (ctx, args) => {
		const { row } = await getCredentialsRowOrThrow(ctx);
		await ctx.db.patch(row._id, {
			linksProcessed: args.linksProcessed,
			highlightsImported: args.highlightsImported,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Mark an import as finished successfully.
 */
export const finishImport = mutation({
	args: {},
	handler: async (ctx) => {
		const { row } = await getCredentialsRowOrThrow(ctx);
		await ctx.db.patch(row._id, {
			lastImportStatus: "completed",
			lastImportFinishedAt: Date.now(),
			updatedAt: Date.now(),
		});
	},
});

/**
 * Mark an import as failed with a message. The most common case is
 * `"token_expired"` after the extension catches CuriusAuthError; the popup
 * surfaces this as a reconnect CTA.
 */
export const failImport = mutation({
	args: { error: v.string() },
	handler: async (ctx, args) => {
		const { row } = await getCredentialsRowOrThrow(ctx);
		await ctx.db.patch(row._id, {
			lastImportStatus: "failed",
			lastImportFinishedAt: Date.now(),
			lastImportError: args.error,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Input shape for one Curius highlight inside a chunk. Context fields are
 * required (empty strings allowed) so the TextQuoteSelector has a consistent
 * shape even when Curius returned no surrounding text.
 */
const importChunkHighlightValidator = v.object({
	externalId: v.string(),
	rawHighlight: v.string(),
	leftContext: v.string(),
	rightContext: v.string(),
});

const importChunkLinkValidator = v.object({
	url: v.string(),
	title: v.optional(v.string()),
	description: v.optional(v.string()),
	siteName: v.optional(v.string()),
	highlights: v.array(importChunkHighlightValidator),
});

/**
 * Ingest a batch of Curius links + their highlights. Called repeatedly from
 * the extension during an import. The dedup keys `(userId, urlHash)` for
 * bookmarks and `(importSource: "curius", externalId)` for highlights make
 * this mutation idempotent — re-running the same chunk is a no-op beyond an
 * `updatedAt` bump.
 *
 * Bookmarks are **insert-if-absent**: native edits win. Highlights are
 * inserted with a quote-only W3C selector built from the Curius
 * text+context, visibility forced to "friends" (matches Curius's sharing
 * model), and `importSource`/`externalId`/`importedAt` set for dedup and
 * bridge-vs-native resolution.
 */
export const importChunk = mutation({
	args: {
		links: v.array(importChunkLinkValidator),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const now = Date.now();
		let bookmarksInserted = 0;
		let highlightsInserted = 0;

		for (const link of args.links) {
			let normalizedUrl: string;
			try {
				normalizedUrl = normalizeUrl(link.url);
			} catch {
				// Skip links with malformed URLs — Curius occasionally has
				// these in old records; one bad row shouldn't fail the batch.
				continue;
			}
			const urlHash = await hashUrl(normalizedUrl);

			const existingBookmark = await ctx.db
				.query("bookmarks")
				.withIndex("by_userId_urlHash", (q) =>
					q.eq("userId", userId).eq("urlHash", urlHash)
				)
				.first();

			if (!existingBookmark) {
				await ctx.db.insert("bookmarks", {
					userId,
					url: normalizedUrl,
					urlHash,
					title: link.title,
					description: link.description,
					siteName: link.siteName,
					searchContent: [link.title, link.description]
						.filter(Boolean)
						.join(" "),
				});
				bookmarksInserted++;
			}

			for (const highlight of link.highlights) {
				const existingHighlight = await ctx.db
					.query("highlights")
					.withIndex("by_importSource_externalId", (q) =>
						q
							.eq("importSource", "curius")
							.eq("externalId", highlight.externalId)
					)
					.first();

				if (existingHighlight) {
					// Re-import: just bump updatedAt so we can see recency; we
					// don't overwrite text or selector (would lose any native
					// edits to imported rows).
					await ctx.db.patch(existingHighlight._id, { updatedAt: now });
					continue;
				}

				await ctx.db.insert("highlights", {
					userId,
					url: normalizedUrl,
					urlHash,
					selector: {
						quote: {
							type: "TextQuoteSelector",
							exact: highlight.rawHighlight,
							prefix: highlight.leftContext,
							suffix: highlight.rightContext,
						},
					},
					text: highlight.rawHighlight,
					visibility: "friends",
					searchContent: highlight.rawHighlight,
					importSource: "curius",
					externalId: highlight.externalId,
					importedAt: now,
					updatedAt: now,
				});
				highlightsInserted++;
			}
		}

		return { bookmarksInserted, highlightsInserted };
	},
});

/**
 * Bulk-upsert mapping rows for Curius users the importer encounters (own
 * following list + authors of bridged highlights). Preserves `glossUserId`
 * when it's already set — the mapping being pointed at a Gloss user is a
 * stronger claim than "this Curius user exists" and must not be clobbered
 * by a subsequent import from a different Gloss user who just knows of them.
 */
const mappingInputValidator = v.object({
	curiusUserId: v.string(),
	curiusUsername: v.string(),
	firstName: v.string(),
	lastName: v.string(),
});

export const upsertMappings = mutation({
	args: { mappings: v.array(mappingInputValidator) },
	handler: async (ctx, args) => {
		await requireAuth(ctx);
		// Extension-side dedup should keep this array tight, but we also
		// dedup within the mutation as a belt-and-braces measure — the
		// mapping table has a non-unique index and duplicate inserts would
		// produce duplicate rows.
		const seen = new Map<string, (typeof args.mappings)[number]>();
		for (const m of args.mappings) {
			seen.set(m.curiusUserId, m);
		}

		const now = Date.now();
		for (const m of seen.values()) {
			const existing = await ctx.db
				.query("curiusUserMappings")
				.withIndex("by_curiusUserId", (q) =>
					q.eq("curiusUserId", m.curiusUserId)
				)
				.first();

			if (existing) {
				// Preserve an already-known glossUserId; refresh display fields.
				await ctx.db.patch(existing._id, {
					curiusUsername: m.curiusUsername,
					firstName: m.firstName,
					lastName: m.lastName,
					updatedAt: now,
				});
			} else {
				await ctx.db.insert("curiusUserMappings", {
					curiusUserId: m.curiusUserId,
					curiusUsername: m.curiusUsername,
					firstName: m.firstName,
					lastName: m.lastName,
					updatedAt: now,
				});
			}
		}
	},
});
