import { auth } from "@gloss/auth";
import type { CuriusHighlight, CuriusLink, CuriusUser } from "@gloss/curius";
import { CuriusAuthError, CuriusClient, CuriusError } from "@gloss/curius";
import { db } from "@gloss/db";
import {
	curiusCredentials,
	curiusUserMapping,
	highlight,
} from "@gloss/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { hashUrl, normalizeUrl } from "../lib/url";

/**
 * Convert Curius position format to TextQuoteSelector.
 * Inlined to avoid importing DOM-dependent @gloss/anchoring package.
 */
function fromCuriusPosition(position: {
	rawHighlight: string;
	leftContext: string;
	rightContext: string;
}): {
	type: "TextQuoteSelector";
	exact: string;
	prefix: string;
	suffix: string;
} {
	return {
		type: "TextQuoteSelector",
		exact: position.rawHighlight,
		prefix: position.leftContext,
		suffix: position.rightContext,
	};
}

/**
 * Get or create a Curius client for a user.
 * Returns null if no credentials are stored.
 */
async function getCuriusClient(userId: string): Promise<CuriusClient | null> {
	const credentials = await db.query.curiusCredentials.findFirst({
		where: eq(curiusCredentials.userId, userId),
	});

	if (!credentials) {
		return null;
	}

	return new CuriusClient({ token: credentials.token });
}

/**
 * Upsert a Curius user in the mapping table.
 * Links to a Gloss user if glossUserId is provided.
 */
async function upsertCuriusUserMapping(
	curiusUser: CuriusUser,
	glossUserId?: string
): Promise<void> {
	const existing = await db.query.curiusUserMapping.findFirst({
		where: eq(curiusUserMapping.curiusUserId, curiusUser.id),
	});

	if (existing) {
		await db
			.update(curiusUserMapping)
			.set({
				curiusUsername: curiusUser.userLink,
				firstName: curiusUser.firstName,
				lastName: curiusUser.lastName,
				...(glossUserId && { glossUserId }),
			})
			.where(eq(curiusUserMapping.curiusUserId, curiusUser.id));
	} else {
		await db.insert(curiusUserMapping).values({
			id: createId(),
			curiusUserId: curiusUser.id,
			curiusUsername: curiusUser.userLink,
			firstName: curiusUser.firstName,
			lastName: curiusUser.lastName,
			glossUserId: glossUserId ?? null,
		});
	}
}

export interface ImportResult {
	imported: number;
	skipped: number;
	failed: number;
}

/**
 * Convert a Curius highlight to a Gloss selector format.
 */
function curiusHighlightToSelector(
	curiusHighlight: CuriusHighlight
): Record<string, unknown> {
	const rawHighlight =
		curiusHighlight.rawHighlight ?? curiusHighlight.highlight;
	const leftContext = curiusHighlight.leftContext ?? "";
	const rightContext = curiusHighlight.rightContext ?? "";

	const quote = fromCuriusPosition({ rawHighlight, leftContext, rightContext });

	return {
		quote,
		position: { type: "TextPositionSelector", start: 0, end: 0 },
		range: {
			type: "RangeSelector",
			startContainer: "",
			startOffset: 0,
			endContainer: "",
			endOffset: 0,
		},
	};
}

/**
 * Import a single Curius highlight into Gloss.
 * Returns true if imported, false if skipped (already exists).
 */
async function importCuriusHighlight(
	glossUserId: string,
	link: CuriusLink,
	curiusHighlight: CuriusHighlight
): Promise<boolean> {
	const externalId = `curius:${curiusHighlight.id}`;

	const existing = await db.query.highlight.findFirst({
		where: and(
			eq(highlight.importSource, "curius"),
			eq(highlight.externalId, externalId)
		),
	});

	if (existing) {
		return false;
	}

	const url = link.url ?? link.link ?? "";
	if (!url) {
		return false;
	}

	const normalizedUrl = normalizeUrl(url);
	const urlHash = await hashUrl(normalizedUrl);
	const selector = curiusHighlightToSelector(curiusHighlight);
	const text = curiusHighlight.rawHighlight ?? curiusHighlight.highlight;

	await db.insert(highlight).values({
		id: createId(),
		userId: glossUserId,
		url: normalizedUrl,
		urlHash,
		selector,
		text,
		visibility: "friends",
		importSource: "curius",
		externalId,
		importedAt: new Date(),
	});

	return true;
}

/**
 * Import all Curius highlights for a user.
 */
async function importCuriusHighlights(
	client: CuriusClient,
	glossUserId: string
): Promise<ImportResult> {
	const result: ImportResult = { imported: 0, skipped: 0, failed: 0 };

	let links: CuriusLink[];
	try {
		links = await client.getUserLinks();
	} catch {
		return result;
	}

	for (const link of links) {
		for (const curiusHighlight of link.highlights) {
			try {
				const wasImported = await importCuriusHighlight(
					glossUserId,
					link,
					curiusHighlight
				);
				if (wasImported) {
					result.imported++;
				} else {
					result.skipped++;
				}
			} catch {
				result.failed++;
			}
		}
	}

	return result;
}

/**
 * Curius routes for Elysia
 * Uses Eden Treaty for type-safe client consumption
 */
export const curiusRoutes = new Elysia({ prefix: "/curius" })
	// Derive session for all curius routes
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return { session };
	})

	// Get connection status
	.get("/status", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const credentials = await db.query.curiusCredentials.findFirst({
			where: eq(curiusCredentials.userId, session.user.id),
		});

		if (!credentials) {
			return { connected: false as const };
		}

		return {
			connected: true as const,
			curiusUserId: credentials.curiusUserId,
			curiusUsername: credentials.curiusUsername,
			lastVerifiedAt: credentials.lastVerifiedAt?.toISOString() ?? null,
		};
	})

	// Connect Curius account (with auto-import)
	.post(
		"/connect",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const client = new CuriusClient({ token: body.token });

			// Verify the token and get user info
			let curiusUser: CuriusUser;
			try {
				curiusUser = await client.getUser();
			} catch (err) {
				if (err instanceof CuriusAuthError) {
					set.status = 401;
					return { error: "Invalid Curius token" };
				}
				set.status = 500;
				return {
					error:
						err instanceof CuriusError
							? err.message
							: "Failed to verify Curius token",
				};
			}

			// Upsert the credentials
			const existing = await db.query.curiusCredentials.findFirst({
				where: eq(curiusCredentials.userId, session.user.id),
			});

			if (existing) {
				await db
					.update(curiusCredentials)
					.set({
						token: body.token,
						curiusUserId: curiusUser.id,
						curiusUsername: curiusUser.userLink,
						lastVerifiedAt: new Date(),
					})
					.where(eq(curiusCredentials.userId, session.user.id));
			} else {
				await db.insert(curiusCredentials).values({
					id: createId(),
					userId: session.user.id,
					token: body.token,
					curiusUserId: curiusUser.id,
					curiusUsername: curiusUser.userLink,
					lastVerifiedAt: new Date(),
				});
			}

			// Upsert the user mapping (links Curius user to Gloss user)
			await upsertCuriusUserMapping(curiusUser, session.user.id);

			// Auto-import highlights
			const importResult = await importCuriusHighlights(
				client,
				session.user.id
			);

			return {
				success: true,
				curiusUserId: curiusUser.id,
				curiusUsername: curiusUser.userLink,
				import: importResult,
			};
		},
		{
			body: t.Object({
				token: t.String({ minLength: 1 }),
			}),
		}
	)

	// Manual re-import (for new highlights added after initial connection)
	.post("/import", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const client = await getCuriusClient(session.user.id);
		if (!client) {
			set.status = 412;
			return { error: "Curius account not connected" };
		}

		const importResult = await importCuriusHighlights(client, session.user.id);

		return {
			success: true,
			...importResult,
		};
	})

	// Disconnect Curius account
	.delete("/disconnect", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		await db
			.delete(curiusCredentials)
			.where(eq(curiusCredentials.userId, session.user.id));

		return { success: true };
	})

	// Get Curius user profile
	.get("/user", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const client = await getCuriusClient(session.user.id);
		if (!client) {
			set.status = 412;
			return { error: "Curius account not connected" };
		}

		try {
			return await client.getUser();
		} catch (err) {
			if (err instanceof CuriusAuthError) {
				set.status = 401;
				return { error: "Curius token expired or invalid" };
			}
			throw err;
		}
	})

	// Get following list
	.get("/following", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const client = await getCuriusClient(session.user.id);
		if (!client) {
			set.status = 412;
			return { error: "Curius account not connected" };
		}

		return await client.getFollowing();
	})

	// Get link by URL
	.post(
		"/links/by-url",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const client = await getCuriusClient(session.user.id);
			if (!client) {
				set.status = 412;
				return { error: "Curius account not connected" };
			}

			return await client.getLinkByUrl(body.url);
		},
		{
			body: t.Object({
				url: t.String({ format: "uri" }),
			}),
		}
	)

	// Get network info for a URL (who saved it, their highlights)
	.post(
		"/links/network",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const client = await getCuriusClient(session.user.id);
			if (!client) {
				set.status = 412;
				return { error: "Curius account not connected" };
			}

			return await client.getNetworkInfo(body.url);
		},
		{
			body: t.Object({
				url: t.String({ format: "uri" }),
			}),
		}
	)

	// Add a link
	.post(
		"/links",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const client = await getCuriusClient(session.user.id);
			if (!client) {
				set.status = 412;
				return { error: "Curius account not connected" };
			}

			return await client.addLink(body);
		},
		{
			body: t.Object({
				url: t.String({ format: "uri" }),
				title: t.Optional(t.String()),
			}),
		}
	)

	// Add a highlight to a link
	.post(
		"/links/:linkId/highlights",
		async ({ params, body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const client = await getCuriusClient(session.user.id);
			if (!client) {
				set.status = 412;
				return { error: "Curius account not connected" };
			}

			return await client.addHighlight(params.linkId, body.position);
		},
		{
			params: t.Object({
				linkId: t.String(),
			}),
			body: t.Object({
				position: t.Object({
					rawHighlight: t.String(),
					leftContext: t.String(),
					rightContext: t.String(),
				}),
				note: t.Optional(t.String()),
			}),
		}
	)

	// Delete a highlight from a link
	.delete(
		"/links/:linkId/highlights",
		async ({ params, body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const client = await getCuriusClient(session.user.id);
			if (!client) {
				set.status = 412;
				return { error: "Curius account not connected" };
			}

			await client.deleteHighlight(params.linkId, body.highlightText);
			return { success: true };
		},
		{
			params: t.Object({
				linkId: t.String(),
			}),
			body: t.Object({
				highlightText: t.String(),
			}),
		}
	);
