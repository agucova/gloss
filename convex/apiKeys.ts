import { v } from "convex/values";

import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { requireAuth } from "./lib/auth";

async function hashApiKey(plaintext: string): Promise<string> {
	const data = new TextEncoder().encode(plaintext);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function generatePlaintextKey(): { plaintext: string; keyPrefix: string } {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	const randomHex = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	const plaintext = `gloss_sk_${randomHex}`;
	const keyPrefix = plaintext.slice(0, 17);
	return { plaintext, keyPrefix };
}

export const create = mutation({
	args: {
		name: v.string(),
		scope: v.optional(v.union(v.literal("read"), v.literal("write"))),
		expiresAt: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);

		const { plaintext, keyPrefix } = generatePlaintextKey();
		const keyHash = await hashApiKey(plaintext);

		const id = await ctx.db.insert("apiKeys", {
			userId,
			name: args.name,
			keyHash,
			keyPrefix,
			scope: args.scope ?? "read",
			expiresAt: args.expiresAt,
			revoked: false,
		});

		return { id, key: plaintext, keyPrefix };
	},
});

// Mints a key for a userId without requiring a session. Only callable from
// trusted server-side code (the CLI token-exchange httpAction after PKCE
// verification succeeds).
export const createForUser = internalMutation({
	args: {
		userId: v.id("users"),
		name: v.string(),
		scope: v.union(v.literal("read"), v.literal("write")),
		expiresAt: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const { plaintext, keyPrefix } = generatePlaintextKey();
		const keyHash = await hashApiKey(plaintext);

		const id = await ctx.db.insert("apiKeys", {
			userId: args.userId,
			name: args.name,
			keyHash,
			keyPrefix,
			scope: args.scope,
			expiresAt: args.expiresAt,
			revoked: false,
		});

		return { id, key: plaintext, keyPrefix };
	},
});

export const list = query({
	args: {},
	handler: async (ctx) => {
		const auth = await import("./lib/auth").then((m) =>
			m.getAuthenticatedUser(ctx)
		);
		if (!auth) return [];

		const keys = await ctx.db
			.query("apiKeys")
			.withIndex("by_userId", (q) => q.eq("userId", auth.userId))
			.collect();

		return keys
			.filter((k) => !k.revoked)
			.map((k) => ({
				_id: k._id,
				name: k.name,
				keyPrefix: k.keyPrefix,
				scope: k.scope,
				lastUsedAt: k.lastUsedAt,
				expiresAt: k.expiresAt,
				_creationTime: k._creationTime,
			}));
	},
});

export const update = mutation({
	args: {
		id: v.id("apiKeys"),
		name: v.optional(v.string()),
		scope: v.optional(v.union(v.literal("read"), v.literal("write"))),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const key = await ctx.db.get(args.id);
		if (!key) throw new Error("API key not found");
		if (key.userId !== userId) throw new Error("Not authorized");

		const updates: Record<string, unknown> = {};
		if (args.name !== undefined) updates.name = args.name;
		if (args.scope !== undefined) updates.scope = args.scope;

		await ctx.db.patch(args.id, updates);
		return args.id;
	},
});

export const revoke = mutation({
	args: { id: v.id("apiKeys") },
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const key = await ctx.db.get(args.id);
		if (!key) throw new Error("API key not found");
		if (key.userId !== userId) throw new Error("Not authorized");

		await ctx.db.patch(args.id, { revoked: true });
		return { success: true };
	},
});

export const validate = internalQuery({
	args: { keyHash: v.string() },
	handler: async (ctx, args) => {
		const key = await ctx.db
			.query("apiKeys")
			.withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash))
			.first();

		if (!key) return null;
		if (key.revoked) return null;
		if (key.expiresAt && key.expiresAt < Date.now()) return null;

		return {
			userId: key.userId,
			keyId: key._id,
			scope: key.scope,
		};
	},
});

// Bump the key's lastUsedAt. Called fire-and-forget from the API httpActions
// after a successful authenticated request so the settings UI can show when
// each key was last seen.
export const touch = internalMutation({
	args: { keyId: v.id("apiKeys") },
	handler: async (ctx, args) => {
		const key = await ctx.db.get(args.keyId);
		if (!key || key.revoked) return;
		await ctx.db.patch(args.keyId, { lastUsedAt: Date.now() });
	},
});
