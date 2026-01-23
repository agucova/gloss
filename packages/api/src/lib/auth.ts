import { auth } from "@gloss/auth";
import { updateKeyLastUsed, validateApiKey } from "../routes/api-keys";

export type AuthMethod = "session" | "api_key";
export type ApiKeyScope = "read" | "write";

export interface AuthContext extends Record<string, unknown> {
	session: {
		user: { id: string; name: string; email: string };
	} | null;
	authMethod: AuthMethod | null;
	apiKeyId: string | null;
	apiKeyScope: ApiKeyScope | null;
}

/**
 * Derive auth context from request.
 * Supports both session cookies and API key Bearer tokens.
 *
 * API keys are checked first (Authorization: Bearer gloss_sk_xxx),
 * then falls back to session auth (cookies).
 *
 * Usage:
 *   .derive(async ({ request }) => deriveAuth(request))
 */
export async function deriveAuth(request: Request): Promise<AuthContext> {
	// Check for Bearer token (API key auth)
	const authHeader = request.headers.get("Authorization");
	if (authHeader?.startsWith("Bearer ")) {
		const token = authHeader.slice(7);
		const keyData = await validateApiKey(token);
		if (keyData) {
			// Update lastUsedAt (fire-and-forget)
			updateKeyLastUsed(keyData.id);
			return {
				session: { user: keyData.user },
				authMethod: "api_key",
				apiKeyId: keyData.id,
				apiKeyScope: keyData.scope,
			};
		}
		// Invalid API key - don't fall back, return null
		return {
			session: null,
			authMethod: null,
			apiKeyId: null,
			apiKeyScope: null,
		};
	}

	// Fall back to session auth
	const session = await auth.api.getSession({
		headers: request.headers,
	});

	if (session) {
		return {
			session: {
				user: {
					id: session.user.id,
					name: session.user.name,
					email: session.user.email,
				},
			},
			authMethod: "session",
			apiKeyId: null,
			apiKeyScope: null,
		};
	}

	return {
		session: null,
		authMethod: null,
		apiKeyId: null,
		apiKeyScope: null,
	};
}

/**
 * Helper to check if current request has write access.
 * Session auth always has write access.
 * API key auth needs "write" scope.
 */
export function hasWriteAccess(ctx: AuthContext): boolean {
	if (!ctx.session) return false;
	if (ctx.authMethod === "session") return true;
	if (ctx.authMethod === "api_key") return ctx.apiKeyScope === "write";
	return false;
}
