import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { rateLimiter } from "./lib/ratelimit";

const http = httpRouter();

// Register Better-Auth routes (handles /api/auth/*).
//
// CORS allowlist tracks the trusted origins in convex/auth.ts:
// - SITE_URL for the web app
// - EXTENSION_ORIGINS (comma-separated chrome-extension://ID / moz-extension://ID
//   values) so the browser extension can hit /api/auth/* and /api/auth/convex/token
//   via the crossDomain plugin.
const extensionOrigins = (process.env.EXTENSION_ORIGINS ?? "")
	.split(",")
	.map((o) => o.trim())
	.filter(Boolean);

authComponent.registerRoutes(http, createAuth, {
	cors: {
		allowedOrigins: [process.env.SITE_URL!, ...extensionOrigins],
	},
});

// ─── Helpers ────────────────────────────────────────

function corsHeaders(): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
	};
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json", ...corsHeaders() },
	});
}

async function validateApiKeyFromRequest(
	ctx: any,
	request: Request
): Promise<{ userId: string; keyId: string; scope: string } | null> {
	const authHeader = request.headers.get("Authorization");
	if (!authHeader?.startsWith("Bearer ")) return null;

	const token = authHeader.slice(7);
	const encoder = new TextEncoder();
	const data = encoder.encode(token);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const keyHash = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	const result = await ctx.runQuery(internal.apiKeys.validate, { keyHash });
	return result ?? null;
}

// Fire-and-forget lastUsedAt bump. Logs failures but never throws — the
// request has already succeeded by the time we touch the key.
async function touchApiKey(ctx: any, keyId: string): Promise<void> {
	try {
		await ctx.runMutation(internal.apiKeys.touch, { keyId });
	} catch (err) {
		console.error("[http] failed to touch api key", err);
	}
}

// ─── CLI OAuth (PKCE) endpoints ─────────────────────
// Browser-initiated PKCE flow that mints an API key without the CLI ever
// holding the user's session. See packages/cli/src/lib/oauth.ts for the
// client side.

http.route({
	path: "/api/auth/cli/authorize",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		// Rate-limit per client IP — each authorize call inserts a row into
		// `cliAuthPending`, so without this a script could fill the table.
		// `x-forwarded-for` is the Convex edge proxy's header; falls back to
		// a constant so missing-header doesn't become a bypass.
		const ip =
			request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
			"unknown";
		const limit = await rateLimiter.limit(ctx, "cliAuthorizePerIp", {
			key: ip,
		});
		if (!limit.ok) {
			return json(
				{
					error: "rate_limited",
					retry_after_ms: limit.retryAfter,
				},
				429
			);
		}

		const url = new URL(request.url);
		const codeChallenge = url.searchParams.get("code_challenge");
		const redirectUri = url.searchParams.get("redirect_uri");
		const state = url.searchParams.get("state");

		if (!codeChallenge || !redirectUri || !state) {
			return json({ error: "Missing required parameters" }, 400);
		}

		let requestId: string;
		try {
			const result = await ctx.runMutation(
				internal.cliAuth.createPendingRequest,
				{ codeChallenge, redirectUri, state }
			);
			requestId = result.requestId;
		} catch (err) {
			return json(
				{ error: err instanceof Error ? err.message : "invalid_request" },
				400
			);
		}

		const siteUrl = process.env.SITE_URL;
		if (!siteUrl) {
			return json({ error: "Server misconfigured: SITE_URL unset" }, 500);
		}
		const consentUrl = new URL("/cli/authorize", siteUrl);
		consentUrl.searchParams.set("request", requestId);
		return new Response(null, {
			status: 302,
			headers: { Location: consentUrl.toString() },
		});
	}),
});

http.route({
	path: "/api/auth/cli/token",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		let body: { code?: string; code_verifier?: string; auth_id?: string };
		try {
			body = (await request.json()) as typeof body;
		} catch {
			return json({ error: "Invalid JSON body" }, 400);
		}

		const { code, code_verifier, auth_id } = body;
		if (!code || !code_verifier || !auth_id) {
			return json({ error: "Missing code, code_verifier, or auth_id" }, 400);
		}

		try {
			const result = await ctx.runMutation(internal.cliAuth.exchangeForApiKey, {
				requestId: auth_id as any,
				authCode: code,
				codeVerifier: code_verifier,
			});
			return json({
				api_key: result.apiKey,
				key_id: result.keyId,
				scope: result.scope,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "invalid_grant";
			return json({ error: message }, 400);
		}
	}),
});

http.route({
	path: "/api/auth/cli/token",
	method: "OPTIONS",
	handler: httpAction(async () => {
		return new Response(null, { status: 204, headers: corsHeaders() });
	}),
});

// ─── Dev-only: session-cookie helper for e2e ────────
// Mints a Better-Auth session for an existing seed user so Playwright tests
// can inject the cookie into a browser context. Uses the testUtils plugin
// which is registered in convex/auth.ts only when ALLOW_DEV_MINT=true. This
// endpoint MUST stay 404 when the plugin isn't registered (i.e. on prod).
http.route({
	path: "/api/auth/_dev/create-session",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		if (process.env.ALLOW_DEV_MINT !== "true") {
			return json({ error: "disabled" }, 404);
		}

		let body: { email?: string };
		try {
			body = (await request.json()) as typeof body;
		} catch {
			return json({ error: "Invalid JSON body" }, 400);
		}
		const email = body.email;
		if (!email) return json({ error: "email is required" }, 400);

		const { auth } = await authComponent.getAuth(createAuth, ctx);

		const authCtx = await (
			auth as unknown as {
				$context: Promise<{
					test?: {
						login: (opts: { userId: string }) => Promise<{
							cookies: Array<{
								name: string;
								value: string;
								domain: string;
								path: string;
								httpOnly?: boolean;
								secure?: boolean;
								sameSite?: "Lax" | "Strict" | "None";
							}>;
						}>;
					};
				}>;
			}
		).$context;
		if (!authCtx.test) {
			return json(
				{ error: "testUtils plugin is not registered — check ALLOW_DEV_MINT" },
				500
			);
		}

		// Look up the Better-Auth userId via our users table's authId column
		// (populated by the onCreate user trigger in convex/auth.ts). Every
		// seed user already has a Better-Auth user record because the seed
		// runs through the same component triggers.
		const appUser = await ctx.runQuery(internal.cliAuth._devLookupAuthId, {
			email,
		});
		if (!appUser?.authId) {
			return json({ error: `No Better-Auth user found for ${email}` }, 404);
		}

		const { cookies } = await authCtx.test.login({ userId: appUser.authId });
		return json({ cookies });
	}),
});

// Dev-only: flip a seed user's profileVisibility so e2e tests can exercise
// the access-control matrix. 404 when ALLOW_DEV_MINT isn't set.
http.route({
	path: "/api/_dev/set-visibility",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		if (process.env.ALLOW_DEV_MINT !== "true") {
			return json({ error: "disabled" }, 404);
		}
		let body: {
			email?: string;
			visibility?: "public" | "friends" | "private";
		};
		try {
			body = (await request.json()) as typeof body;
		} catch {
			return json({ error: "Invalid JSON body" }, 400);
		}
		const { email, visibility } = body;
		if (
			!email ||
			(visibility !== "public" &&
				visibility !== "friends" &&
				visibility !== "private")
		) {
			return json({ error: "email and visibility are required" }, 400);
		}
		try {
			await ctx.runMutation(internal.testing.setVisibility, {
				email,
				visibility,
			});
			return json({ success: true });
		} catch (err) {
			return json(
				{ error: err instanceof Error ? err.message : "mutation failed" },
				400
			);
		}
	}),
});

http.route({
	path: "/api/_dev/set-visibility",
	method: "OPTIONS",
	handler: httpAction(async () => {
		return new Response(null, { status: 204, headers: corsHeaders() });
	}),
});

// ─── CLI API endpoints ──────────────────────────────
// These provide REST-like access for the CLI and MCP server,
// authenticated via API key Bearer tokens.

http.route({
	path: "/api/search",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		const auth = await validateApiKeyFromRequest(ctx, request);
		if (!auth) return json({ error: "Authentication required" }, 401);

		const url = new URL(request.url);
		const q = url.searchParams.get("q");
		if (!q) return json({ error: "Query parameter 'q' is required" }, 400);

		const results = await ctx.runQuery(internal.search.searchByUserInternal, {
			userId: auth.userId as any,
			q,
			limit: Number(url.searchParams.get("limit")) || 20,
			types: url.searchParams.get("types")?.split(","),
			tagId: (url.searchParams.get("tagId") || undefined) as any,
			domain: url.searchParams.get("domain") || undefined,
			url: url.searchParams.get("url") || undefined,
			after: url.searchParams.get("after") || undefined,
			before: url.searchParams.get("before") || undefined,
			sortBy: url.searchParams.get("sortBy") || undefined,
		});
		await touchApiKey(ctx, auth.keyId);

		return json({
			results: results.results.map((r: any) => ({
				type: r.entityType,
				id: r.entityId,
				url: r.url,
				text: r.entityType === "highlight" ? r.content : undefined,
				title: r.entityType === "bookmark" ? r.content : undefined,
				content: r.entityType === "comment" ? r.content : undefined,
				score: 1,
				ftsScore: 1,
				semanticScore: 0,
				createdAt: new Date(r.createdAt).toISOString(),
			})),
			meta: {
				query: q,
				mode: "fts",
				semanticSearchUsed: false,
				total: results.total,
				limit: Number(url.searchParams.get("limit")) || 20,
				offset: 0,
				sortBy: url.searchParams.get("sortBy") ?? "relevance",
			},
		});
	}),
});

http.route({
	path: "/api/highlights/mine",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		const auth = await validateApiKeyFromRequest(ctx, request);
		if (!auth) return json({ error: "Authentication required" }, 401);

		const url = new URL(request.url);
		const limit = Number(url.searchParams.get("limit")) || 20;

		const result = await ctx.runQuery(internal.highlights.listByUserInternal, {
			userId: auth.userId as any,
			paginationOpts: { numItems: limit, cursor: null },
		});
		await touchApiKey(ctx, auth.keyId);

		return json({
			items: (result.page ?? []).map((h: any) => ({
				id: h._id,
				url: h.url,
				text: h.text,
				visibility: h.visibility,
				createdAt: new Date(h._creationTime).toISOString(),
				user: { id: h.userId, name: null, image: null },
			})),
			nextCursor: null,
		});
	}),
});

http.route({
	path: "/api/bookmarks",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		const auth = await validateApiKeyFromRequest(ctx, request);
		if (!auth) return json({ error: "Authentication required" }, 401);

		const url = new URL(request.url);
		const limit = Number(url.searchParams.get("limit")) || 20;

		const result = await ctx.runQuery(internal.bookmarks.listByUserInternal, {
			userId: auth.userId as any,
			paginationOpts: { numItems: limit, cursor: null },
		});
		await touchApiKey(ctx, auth.keyId);

		return json({
			items: (result.page ?? []).map((b: any) => ({
				id: b._id,
				url: b.url,
				title: b.title ?? null,
				description: b.description ?? null,
				favicon: b.favicon ?? null,
				createdAt: new Date(b._creationTime).toISOString(),
			})),
			nextCursor: null,
		});
	}),
});

http.route({
	path: "/api/bookmarks/tags",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		const auth = await validateApiKeyFromRequest(ctx, request);
		if (!auth) return json({ error: "Authentication required" }, 401);

		const tags = await ctx.runQuery(internal.bookmarks.listTagsByUserInternal, {
			userId: auth.userId as any,
		});
		await touchApiKey(ctx, auth.keyId);

		return json({
			tags: (tags as any[]).map((t: any) => ({
				id: t._id,
				name: t.name,
				color: t.color ?? null,
				isSystem: t.isSystem,
			})),
		});
	}),
});

http.route({
	path: "/api/users/me",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		const auth = await validateApiKeyFromRequest(ctx, request);
		if (!auth) return json({ error: "Authentication required" }, 401);

		const user = await ctx.runQuery(internal.users.getByUserInternal, {
			userId: auth.userId as any,
		});
		if (!user) return json({ error: "User not found" }, 404);
		await touchApiKey(ctx, auth.keyId);

		return json({
			id: user._id,
			name: user.name,
			email: user.email,
			image: user.image ?? null,
		});
	}),
});

export default http;
