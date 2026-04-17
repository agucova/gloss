/**
 * Internal test helpers for e2e tests.
 * These should only be used in development/testing environments.
 */
import { v } from "convex/values";

import { components } from "./_generated/api";
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
 * Destructive: wipe every row from every app and component table.
 *
 * Intended use: one-off reset of dev/prod to a clean slate before launch.
 * Takes a literal confirmation string so nobody runs it by accident — the
 * only valid invocation is:
 *
 *   bunx convex run testing:wipeAll '{"confirm":"i-mean-it"}'
 *   bunx convex run testing:wipeAll '{"confirm":"i-mean-it"}' --prod
 *
 * Clears:
 *   - app tables (users, highlights, bookmarks, comments, commentMentions,
 *     friendships, tags, bookmarkTags, apiKeys, curiusCredentials,
 *     curiusUserMappings, cliAuthPending)
 *   - Better-Auth component tables (user, session, account, verification,
 *     jwks, passkey)
 *   - the rate-limiter component's accumulated token buckets
 */
export const wipeAll = internalMutation({
	args: { confirm: v.literal("i-mean-it") },
	handler: async (ctx) => {
		const appTables = [
			"comments",
			"commentMentions",
			"bookmarkTags",
			"tags",
			"bookmarks",
			"highlights",
			"friendships",
			"apiKeys",
			"cliAuthPending",
			"curiusCredentials",
			"curiusUserMappings",
			"users",
		] as const;
		for (const table of appTables) {
			const rows = await ctx.db.query(table).collect();
			for (const row of rows) {
				await ctx.db.delete(row._id);
			}
		}

		const baTables = [
			"session",
			"account",
			"verification",
			"passkey",
			"jwks",
			"user",
		];
		for (const model of baTables) {
			// deleteMany paginates — loop until we hit an empty page.
			let cursor: string | null = null;
			for (let page = 0; page < 200; page++) {
				const result = (await ctx.runMutation(
					components.betterAuth.adapter.deleteMany,
					{
						input: { model: model as never, where: [] },
						paginationOpts: { numItems: 500, cursor },
					}
				)) as { isDone: boolean; continueCursor: string | null };
				if (result.isDone) break;
				cursor = result.continueCursor;
			}
		}

		await ctx.runMutation(components.rateLimiter.lib.clearAll, {});

		return { ok: true };
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
