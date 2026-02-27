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
