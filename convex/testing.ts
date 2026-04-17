/**
 * Internal test helpers for e2e tests.
 * These should only be used in development/testing environments.
 */
import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Check if a seed user exists by email.
 */
export const verifySeedUser = internalQuery({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", args.email))
			.first();
		return user
			? { exists: true, id: user._id, username: user.username }
			: { exists: false };
	},
});

/**
 * Look up a user by email and return their ID.
 */
export const getUserByEmail = internalQuery({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", args.email))
			.first();
		return user;
	},
});

/**
 * Dev-only helper: mutate a seed user's profileVisibility so e2e tests can
 * exercise the access-control matrix without rewriting seed data. Exposed
 * to Playwright via the /api/_dev/set-visibility httpAction (which checks
 * ALLOW_DEV_MINT).
 */
export const setVisibility = internalMutation({
	args: {
		email: v.string(),
		visibility: v.union(
			v.literal("public"),
			v.literal("friends"),
			v.literal("private")
		),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", args.email))
			.first();
		if (!user) {
			throw new Error(`setVisibility: no user with email ${args.email}`);
		}
		await ctx.db.patch(user._id, {
			profileVisibility: args.visibility,
			updatedAt: Date.now(),
		});
		return { success: true };
	},
});
