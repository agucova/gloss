import { v } from "convex/values";

import { internalMutation, mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";

const REQUEST_TTL_MS = 5 * 60 * 1000;

function randomHex(bytes: number): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return Array.from(buf)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

async function sha256Base64Url(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return toBase64Url(new Uint8Array(hash));
}

function isLoopbackRedirect(uri: string): boolean {
	try {
		const url = new URL(uri);
		if (url.protocol !== "http:") return false;
		if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
			return false;
		}
		if (url.pathname !== "/callback") return false;
		const port = Number(url.port);
		if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
		return true;
	} catch {
		return false;
	}
}

function buildRedirectUrl(
	redirectUri: string,
	params: Record<string, string>
): string {
	const url = new URL(redirectUri);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	return url.toString();
}

// Called by the /api/auth/cli/authorize httpAction. Validates the redirect URI
// and stores the PKCE challenge. Returns the requestId the browser is sent to.
export const createPendingRequest = internalMutation({
	args: {
		codeChallenge: v.string(),
		redirectUri: v.string(),
		state: v.string(),
	},
	handler: async (ctx, args) => {
		if (!isLoopbackRedirect(args.redirectUri)) {
			throw new Error(
				"Invalid redirect_uri: must be http://127.0.0.1:<port>/callback"
			);
		}
		// S256-encoded SHA-256 digest is 43 base64url chars.
		if (
			args.codeChallenge.length !== 43 ||
			!/^[A-Za-z0-9_-]+$/.test(args.codeChallenge)
		) {
			throw new Error("Invalid code_challenge: must be 43-char base64url");
		}
		if (args.state.length < 8 || args.state.length > 128) {
			throw new Error("Invalid state: length must be 8..128");
		}
		const requestId = await ctx.db.insert("cliAuthPending", {
			codeChallenge: args.codeChallenge,
			redirectUri: args.redirectUri,
			state: args.state,
			expiresAt: Date.now() + REQUEST_TTL_MS,
		});
		return { requestId };
	},
});

// Used by the consent page to render the countdown and handle
// already-approved/expired states. Intentionally does NOT return the
// codeChallenge or redirectUri — the caller only needs lifecycle info.
export const getPendingRequest = query({
	args: { requestId: v.id("cliAuthPending") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.requestId);
		if (!row) return { status: "not_found" as const };
		if (row.expiresAt < Date.now()) return { status: "expired" as const };
		if (row.authCode) return { status: "approved" as const };
		return {
			status: "pending" as const,
			expiresAt: row.expiresAt,
		};
	},
});

// Called by the consent page when the user clicks Approve. Generates a
// one-time auth code, binds the row to the user's account, and returns the
// redirect URL that the browser should navigate to (handing the code back to
// the CLI's loopback server).
export const approveRequest = mutation({
	args: { requestId: v.id("cliAuthPending") },
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const row = await ctx.db.get(args.requestId);
		if (!row) throw new Error("Request not found");
		if (row.expiresAt < Date.now()) throw new Error("Request expired");
		if (row.authCode) throw new Error("Request already approved");

		const authCode = randomHex(32);
		await ctx.db.patch(args.requestId, { authCode, userId });

		return {
			redirectUrl: buildRedirectUrl(row.redirectUri, {
				code: authCode,
				auth_id: args.requestId,
				state: row.state,
			}),
		};
	},
});

// Called when the user clicks Deny on the consent page. Deletes the pending
// row and returns the error redirect URL so the browser can hand a clean
// failure back to the CLI.
export const denyRequest = mutation({
	args: { requestId: v.id("cliAuthPending") },
	handler: async (ctx, args) => {
		await requireAuth(ctx);
		const row = await ctx.db.get(args.requestId);
		if (!row) throw new Error("Request not found");

		const redirectUrl = buildRedirectUrl(row.redirectUri, {
			error: "access_denied",
			state: row.state,
		});
		await ctx.db.delete(args.requestId);
		return { redirectUrl };
	},
});

// Called by the /api/auth/cli/token httpAction. Verifies the auth code and
// PKCE challenge, mints a fresh API key for the approved user, deletes the
// pending row, and returns the plaintext key. Atomic: if anything fails the
// row is untouched and the key is not minted.
export const exchangeForApiKey = internalMutation({
	args: {
		requestId: v.id("cliAuthPending"),
		authCode: v.string(),
		codeVerifier: v.string(),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.requestId);
		if (!row) throw new Error("invalid_request");
		if (row.expiresAt < Date.now()) throw new Error("expired_request");
		if (!row.authCode || !row.userId) throw new Error("not_approved");
		if (row.authCode !== args.authCode) throw new Error("invalid_code");

		const derived = await sha256Base64Url(args.codeVerifier);
		if (derived !== row.codeChallenge) throw new Error("invalid_verifier");

		const plaintext = `gloss_sk_${randomHex(16)}`;
		const keyPrefix = plaintext.slice(0, 17);
		const keyHash = await sha256Hex(plaintext);

		const keyId = await ctx.db.insert("apiKeys", {
			userId: row.userId,
			name: `Gloss CLI (approved ${new Date().toISOString().slice(0, 10)})`,
			keyHash,
			keyPrefix,
			scope: "read" as const,
			revoked: false,
		});

		await ctx.db.delete(args.requestId);

		return {
			apiKey: plaintext,
			keyId,
			scope: "read" as const,
			keyPrefix,
		};
	},
});

async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// Dev/CI-only shortcut to mint an API key by user email. Gated by the
// ALLOW_DEV_MINT env var, which must NEVER be set on the production
// deployment. Used by e2e helpers that need a valid key without driving the
// full PKCE browser flow.
export const _devMintApiKey = internalMutation({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		if (process.env.ALLOW_DEV_MINT !== "true") {
			throw new Error(
				"_devMintApiKey is disabled on this deployment (ALLOW_DEV_MINT not set)"
			);
		}

		const user = await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", args.email))
			.first();
		if (!user) throw new Error(`User not found for email ${args.email}`);

		const plaintext = `gloss_sk_${randomHex(16)}`;
		const keyPrefix = plaintext.slice(0, 17);
		const keyHash = await sha256Hex(plaintext);

		const keyId = await ctx.db.insert("apiKeys", {
			userId: user._id,
			name: "E2E test key",
			keyHash,
			keyPrefix,
			scope: "read" as const,
			revoked: false,
		});

		return { apiKey: plaintext, keyId, userId: user._id };
	},
});
