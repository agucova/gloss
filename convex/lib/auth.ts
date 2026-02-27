import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

export type AuthMethod = "session" | "api_key";
export type ApiKeyScope = "read" | "write";

export interface AuthContext {
	userId: Id<"users">;
	authMethod: AuthMethod;
	apiKeyId: Id<"apiKeys"> | null;
	apiKeyScope: ApiKeyScope | null;
}

/**
 * Get the authenticated user from a query/mutation context.
 * Uses Convex's built-in auth identity, then looks up the user in our users table.
 * Returns null if not authenticated.
 */
export async function getAuthenticatedUser(
	ctx: QueryCtx | MutationCtx
): Promise<{ userId: Id<"users"> } | null> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) return null;

	// Look up the user by email in our users table
	const user = await ctx.db
		.query("users")
		.withIndex("by_email", (q) => q.eq("email", identity.email!))
		.first();
	if (!user) return null;
	return { userId: user._id };
}

/**
 * Require authentication. Throws if not authenticated.
 */
export async function requireAuth(
	ctx: QueryCtx | MutationCtx
): Promise<{ userId: Id<"users"> }> {
	const user = await getAuthenticatedUser(ctx);
	if (!user) {
		throw new Error("Authentication required");
	}
	return user;
}

/**
 * Validate an API key from a Bearer token.
 * Hashes the token and looks it up in the apiKeys table.
 */
export async function validateApiKey(
	ctx: QueryCtx | MutationCtx,
	bearerToken: string
): Promise<{
	userId: Id<"users">;
	keyId: Id<"apiKeys">;
	scope: ApiKeyScope;
} | null> {
	// Hash the token
	const encoder = new TextEncoder();
	const data = encoder.encode(bearerToken);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const keyHash = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	// Look up by hash
	const key = await ctx.db
		.query("apiKeys")
		.withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
		.first();

	if (!key) return null;
	if (key.revoked) return null;
	if (key.expiresAt && key.expiresAt < Date.now()) return null;

	return {
		userId: key.userId,
		keyId: key._id,
		scope: key.scope as ApiKeyScope,
	};
}

/**
 * Check if an auth context has write access.
 * Session auth always has write. API keys need "write" scope.
 */
export function hasWriteAccess(authCtx: AuthContext): boolean {
	if (authCtx.authMethod === "session") return true;
	if (authCtx.authMethod === "api_key") return authCtx.apiKeyScope === "write";
	return false;
}
