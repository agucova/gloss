import { auth } from "@gloss/auth";
import { db } from "@gloss/db";
import { apiKey } from "@gloss/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

const API_KEY_PREFIX = "gloss_sk_";

/**
 * Generate a cryptographically secure random API key.
 * Format: gloss_sk_<32-random-chars>
 */
function generateApiKey(): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const randomBytes = crypto.getRandomValues(new Uint8Array(32));
	const randomPart = Array.from(randomBytes)
		.map((b) => chars[b % chars.length])
		.join("");
	return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Hash an API key using SHA-256.
 * We store the hash, never the plaintext key.
 */
async function hashApiKey(key: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(key);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extract key prefix for display (first 8 chars after gloss_sk_).
 */
function getKeyPrefix(key: string): string {
	return key.slice(0, API_KEY_PREFIX.length + 8);
}

/**
 * Validate an API key and return the associated user if valid.
 */
export async function validateApiKey(key: string): Promise<{
	id: string;
	user: { id: string; name: string; email: string };
	scope: "read" | "write";
} | null> {
	if (!key.startsWith(API_KEY_PREFIX)) {
		return null;
	}

	const keyHash = await hashApiKey(key);

	const result = await db.query.apiKey.findFirst({
		where: and(eq(apiKey.keyHash, keyHash), eq(apiKey.revoked, false)),
		with: {
			user: {
				columns: { id: true, name: true, email: true },
			},
		},
	});

	if (!result) {
		return null;
	}

	// Check expiration
	if (result.expiresAt && result.expiresAt < new Date()) {
		return null;
	}

	return {
		id: result.id,
		user: result.user,
		scope: result.scope,
	};
}

/**
 * Update the lastUsedAt timestamp for an API key.
 * Called fire-and-forget on successful auth.
 */
export function updateKeyLastUsed(keyId: string): void {
	db.update(apiKey)
		.set({ lastUsedAt: new Date() })
		.where(eq(apiKey.id, keyId))
		.execute()
		.catch(() => {
			// Ignore errors, this is fire-and-forget
		});
}

/**
 * API key management routes.
 * All routes require session authentication (not API key auth).
 */
export const apiKeys = new Elysia({ prefix: "/keys" })
	// Derive session for all routes
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return { session };
	})

	// Create a new API key
	.post(
		"/",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const plainKey = generateApiKey();
			const keyHash = await hashApiKey(plainKey);
			const keyPrefix = getKeyPrefix(plainKey);

			const [newKey] = await db
				.insert(apiKey)
				.values({
					id: createId(),
					userId: session.user.id,
					name: body.name,
					keyHash,
					keyPrefix,
					scope: body.scope ?? "read",
					expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
				})
				.returning({
					id: apiKey.id,
					name: apiKey.name,
					keyPrefix: apiKey.keyPrefix,
					scope: apiKey.scope,
					expiresAt: apiKey.expiresAt,
					createdAt: apiKey.createdAt,
				});

			if (!newKey) {
				set.status = 500;
				return { error: "Failed to create API key" };
			}

			set.status = 201;
			// Return the plaintext key ONLY on creation
			return {
				...newKey,
				key: plainKey,
			};
		},
		{
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 100 }),
				scope: t.Optional(t.Union([t.Literal("read"), t.Literal("write")])),
				expiresAt: t.Optional(t.String({ format: "date-time" })),
			}),
		}
	)

	// List user's API keys
	.get("/", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const keys = await db.query.apiKey.findMany({
			where: and(eq(apiKey.userId, session.user.id), eq(apiKey.revoked, false)),
			columns: {
				id: true,
				name: true,
				keyPrefix: true,
				scope: true,
				lastUsedAt: true,
				expiresAt: true,
				createdAt: true,
			},
			orderBy: [desc(apiKey.createdAt)],
		});

		return { keys };
	})

	// Update an API key (name or scope)
	.patch(
		"/:id",
		async ({ params, body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const existing = await db.query.apiKey.findFirst({
				where: eq(apiKey.id, params.id),
			});

			if (!existing) {
				set.status = 404;
				return { error: "API key not found" };
			}

			if (existing.userId !== session.user.id) {
				set.status = 403;
				return { error: "Not authorized to update this API key" };
			}

			if (existing.revoked) {
				set.status = 400;
				return { error: "Cannot update a revoked API key" };
			}

			const updates: Partial<typeof apiKey.$inferInsert> = {};
			if (body.name !== undefined) {
				updates.name = body.name;
			}
			if (body.scope !== undefined) {
				updates.scope = body.scope;
			}

			if (Object.keys(updates).length === 0) {
				set.status = 400;
				return { error: "No updates provided" };
			}

			const [updated] = await db
				.update(apiKey)
				.set(updates)
				.where(eq(apiKey.id, params.id))
				.returning({
					id: apiKey.id,
					name: apiKey.name,
					keyPrefix: apiKey.keyPrefix,
					scope: apiKey.scope,
					lastUsedAt: apiKey.lastUsedAt,
					expiresAt: apiKey.expiresAt,
					createdAt: apiKey.createdAt,
				});

			return updated;
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
				scope: t.Optional(t.Union([t.Literal("read"), t.Literal("write")])),
			}),
		}
	)

	// Revoke an API key
	.delete(
		"/:id",
		async ({ params, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const existing = await db.query.apiKey.findFirst({
				where: eq(apiKey.id, params.id),
			});

			if (!existing) {
				set.status = 404;
				return { error: "API key not found" };
			}

			if (existing.userId !== session.user.id) {
				set.status = 403;
				return { error: "Not authorized to revoke this API key" };
			}

			// Soft-revoke by setting revoked flag
			await db
				.update(apiKey)
				.set({ revoked: true })
				.where(eq(apiKey.id, params.id));

			return { success: true };
		},
		{
			params: t.Object({ id: t.String() }),
		}
	);
