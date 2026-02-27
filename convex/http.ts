import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Register Better-Auth routes (handles /api/auth/*)
authComponent.registerRoutes(http, createAuth, {
	cors: {
		allowedOrigins: [process.env.SITE_URL!],
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
): Promise<{ userId: string; scope: string } | null> {
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

		const { api } = await import("./_generated/api");
		const results = await ctx.runQuery(api.search.search, {
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

		const { api } = await import("./_generated/api");
		const result = await ctx.runQuery(api.highlights.listMine, {
			paginationOpts: { numItems: limit, cursor: null },
		});

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

		const { api } = await import("./_generated/api");
		const result = await ctx.runQuery(api.bookmarks.list, {
			paginationOpts: { numItems: limit, cursor: null },
		});

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

		const { api } = await import("./_generated/api");
		const tags = await ctx.runQuery(api.bookmarks.listTags, {});

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

		const { api } = await import("./_generated/api");
		const user = await ctx.runQuery(api.users.getMe);
		if (!user) return json({ error: "User not found" }, 404);

		return json({
			id: user._id,
			name: user.name,
			email: user.email,
			image: user.image ?? null,
		});
	}),
});

export default http;
