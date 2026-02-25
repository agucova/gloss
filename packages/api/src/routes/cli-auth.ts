import { auth } from "@gloss/auth";
import { db } from "@gloss/db";
import { apiKey } from "@gloss/db/schema";
import { env } from "@gloss/env/server";
import { createId } from "@paralleldrive/cuid2";
import { Elysia, t } from "elysia";

const CLI_KEY_PREFIX = "gloss_sk_";

// In-memory store for pending auth codes
// In production, this would be Redis or a database table
interface PendingAuth {
	codeChallenge: string;
	redirectUri: string;
	createdAt: number;
	userId?: string;
	code?: string;
}

const pendingAuths = new Map<string, PendingAuth>();

// Cleanup old pending auths every 5 minutes
setInterval(
	() => {
		const now = Date.now();
		const fiveMinutesAgo = now - 5 * 60 * 1000;
		for (const [key, pending] of pendingAuths.entries()) {
			if (pending.createdAt < fiveMinutesAgo) {
				pendingAuths.delete(key);
			}
		}
	},
	5 * 60 * 1000
);

/**
 * Generate a random string for auth state/codes.
 */
function generateRandomString(length: number): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const randomBytes = crypto.getRandomValues(new Uint8Array(length));
	return Array.from(randomBytes)
		.map((b) => chars[b % chars.length])
		.join("");
}

/**
 * Generate a cryptographically secure API key.
 */
function generateApiKey(): string {
	const randomPart = generateRandomString(32);
	return `${CLI_KEY_PREFIX}${randomPart}`;
}

/**
 * Hash an API key using SHA-256.
 */
async function hashApiKey(key: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(key);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify PKCE code_verifier against code_challenge.
 * Uses S256 method (SHA-256).
 */
async function verifyCodeChallenge(
	codeVerifier: string,
	codeChallenge: string
): Promise<boolean> {
	const encoder = new TextEncoder();
	const data = encoder.encode(codeVerifier);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = new Uint8Array(hashBuffer);
	// Base64url encode
	const base64 = btoa(String.fromCharCode(...hashArray))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	return base64 === codeChallenge;
}

/**
 * CLI OAuth routes for browser-based authentication.
 * Implements OAuth 2.0 with PKCE for CLI clients.
 */
export const cliAuth = new Elysia({ prefix: "/auth/cli" })
	/**
	 * Initiate CLI auth flow.
	 * CLI opens browser to this URL with PKCE code_challenge.
	 * Returns HTML that redirects to login if not authenticated,
	 * or generates auth code and redirects to CLI callback.
	 */
	.get(
		"/authorize",
		async ({ query, set, request }) => {
			const { code_challenge, redirect_uri, state } = query;

			// Validate redirect_uri is localhost
			if (
				!(
					redirect_uri.startsWith("http://localhost:") ||
					redirect_uri.startsWith("http://127.0.0.1:")
				)
			) {
				set.status = 400;
				return { error: "redirect_uri must be localhost" };
			}

			// Generate a state token for this auth flow
			const authId = generateRandomString(32);

			// Store pending auth
			pendingAuths.set(authId, {
				codeChallenge: code_challenge,
				redirectUri: redirect_uri,
				createdAt: Date.now(),
			});

			// Check if user is already authenticated
			const session = await auth.api.getSession({
				headers: request.headers,
			});

			if (session) {
				// User is logged in, generate auth code and redirect
				const code = generateRandomString(32);
				const pending = pendingAuths.get(authId);
				if (pending) {
					pending.userId = session.user.id;
					pending.code = code;
				}

				// Redirect to CLI callback with code
				const callbackUrl = new URL(redirect_uri);
				callbackUrl.searchParams.set("code", code);
				callbackUrl.searchParams.set("auth_id", authId);
				if (state) {
					callbackUrl.searchParams.set("state", state);
				}

				set.redirect = callbackUrl.toString();
				return;
			}

			// User not logged in, redirect to login page with return URL
			const webUrl = env.VITE_WEB_URL || "http://localhost:3001";
			const returnUrl = new URL("/api/auth/cli/authorize", env.BETTER_AUTH_URL);
			returnUrl.searchParams.set("code_challenge", code_challenge);
			returnUrl.searchParams.set("redirect_uri", redirect_uri);
			returnUrl.searchParams.set("auth_id", authId);
			if (state) {
				returnUrl.searchParams.set("state", state);
			}

			const loginUrl = new URL("/login", webUrl);
			loginUrl.searchParams.set("callbackUrl", returnUrl.toString());

			set.redirect = loginUrl.toString();
		},
		{
			query: t.Object({
				code_challenge: t.String({ minLength: 43, maxLength: 128 }),
				redirect_uri: t.String(),
				state: t.Optional(t.String()),
				auth_id: t.Optional(t.String()),
			}),
		}
	)

	/**
	 * Complete auth after login.
	 * This is called when user returns from login page.
	 */
	.get(
		"/callback",
		async ({ query, set, request }) => {
			const { auth_id, code_challenge, redirect_uri, state } = query;

			// Get session
			const session = await auth.api.getSession({
				headers: request.headers,
			});

			if (!session) {
				set.status = 401;
				return { error: "Not authenticated" };
			}

			// Get or create pending auth
			let pending = pendingAuths.get(auth_id);
			if (!pending) {
				// Create new pending auth from query params
				pending = {
					codeChallenge: code_challenge,
					redirectUri: redirect_uri,
					createdAt: Date.now(),
				};
				pendingAuths.set(auth_id, pending);
			}

			// Generate auth code
			const code = generateRandomString(32);
			pending.userId = session.user.id;
			pending.code = code;

			// Redirect to CLI callback with code
			const callbackUrl = new URL(pending.redirectUri);
			callbackUrl.searchParams.set("code", code);
			callbackUrl.searchParams.set("auth_id", auth_id);
			if (state) {
				callbackUrl.searchParams.set("state", state);
			}

			set.redirect = callbackUrl.toString();
		},
		{
			query: t.Object({
				auth_id: t.String(),
				code_challenge: t.String(),
				redirect_uri: t.String(),
				state: t.Optional(t.String()),
			}),
		}
	)

	/**
	 * Exchange auth code for API key.
	 * CLI calls this with code and code_verifier.
	 */
	.post(
		"/token",
		async ({ body, set }) => {
			const { code, code_verifier, auth_id } = body;

			// Get pending auth
			const pending = pendingAuths.get(auth_id);
			if (!pending) {
				set.status = 400;
				return { error: "Invalid or expired auth_id" };
			}

			// Verify code
			if (pending.code !== code) {
				set.status = 400;
				return { error: "Invalid code" };
			}

			// Verify PKCE
			const valid = await verifyCodeChallenge(
				code_verifier,
				pending.codeChallenge
			);
			if (!valid) {
				set.status = 400;
				return { error: "Invalid code_verifier" };
			}

			// Verify user
			if (!pending.userId) {
				set.status = 400;
				return { error: "Auth flow incomplete" };
			}

			// Generate API key
			const plainKey = generateApiKey();
			const keyHash = await hashApiKey(plainKey);
			const keyPrefix = plainKey.slice(0, CLI_KEY_PREFIX.length + 8);

			// Create API key in database
			const [newKey] = await db
				.insert(apiKey)
				.values({
					id: createId(),
					userId: pending.userId,
					name: "CLI Login",
					keyHash,
					keyPrefix,
					scope: "write",
				})
				.returning({
					id: apiKey.id,
					name: apiKey.name,
					scope: apiKey.scope,
					createdAt: apiKey.createdAt,
				});

			// Clean up pending auth
			pendingAuths.delete(auth_id);

			if (!newKey) {
				set.status = 500;
				return { error: "Failed to create API key" };
			}

			return {
				api_key: plainKey,
				key_id: newKey.id,
				scope: newKey.scope,
				created_at: newKey.createdAt.toISOString(),
			};
		},
		{
			body: t.Object({
				code: t.String(),
				code_verifier: t.String({ minLength: 43, maxLength: 128 }),
				auth_id: t.String(),
			}),
		}
	);
