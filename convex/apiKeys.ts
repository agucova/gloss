import { v } from "convex/values";

import { internalQuery, mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";

export const create = mutation({
	args: {
		name: v.string(),
		scope: v.optional(v.union(v.literal("read"), v.literal("write"))),
		expiresAt: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);

		// Generate key: gloss_sk_ + 32 random hex chars
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		const randomHex = Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		const plaintext = `gloss_sk_${randomHex}`;
		const keyPrefix = plaintext.slice(0, 17); // "gloss_sk_" + first 8 hex chars

		// Hash for storage
		const encoder = new TextEncoder();
		const data = encoder.encode(plaintext);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const keyHash = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		const id = await ctx.db.insert("apiKeys", {
			userId,
			name: args.name,
			keyHash,
			keyPrefix,
			scope: args.scope ?? "read",
			expiresAt: args.expiresAt,
			revoked: false,
		});

		// Return plaintext only on creation (never stored)
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
