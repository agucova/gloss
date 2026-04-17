import { passkey as passkeyPlugin } from "@better-auth/passkey";
import {
	type AuthFunctions,
	createClient,
	type GenericCtx,
} from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { admin, magicLink, testUtils } from "better-auth/plugins";

import type { DataModel } from "./_generated/dataModel";

import { components, internal } from "./_generated/api";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import betterAuthSchema from "./betterAuth/schema";
import { cascadeDeleteUser } from "./lib/cascade";
import { rateLimiter } from "./lib/ratelimit";

const siteUrl = process.env.SITE_URL!;

// Extension origin(s) Better-Auth should accept once the extension starts
// making authenticated API calls. Set via
// `bunx convex env set EXTENSION_ORIGINS chrome-extension://<id>,...`.
const extensionOrigins = (process.env.EXTENSION_ORIGINS ?? "")
	.split(",")
	.map((o) => o.trim())
	.filter(Boolean);

// biome-ignore lint/suspicious/noExplicitAny: AuthFunctions typing depends on
// the regenerated _generated/api.d.ts, which only stabilizes after convex dev
// reprocesses this file; a narrow cast keeps the initial build clean.
const authFunctions: AuthFunctions = internal.auth as any;

export const authComponent = createClient<DataModel, typeof betterAuthSchema>(
	components.betterAuth,
	{
		authFunctions,
		local: {
			schema: betterAuthSchema,
		},
		triggers: {
			user: {
				onCreate: async (ctx, authUser) => {
					const userId = await ctx.db.insert("users", {
						authId: authUser._id,
						name: authUser.name,
						email: authUser.email,
						emailVerified: authUser.emailVerified,
						image: authUser.image ?? undefined,
						profileVisibility: "public",
						highlightsVisibility: "friends",
						bookmarksVisibility: "public",
						highlightDisplayFilter: "friends",
						commentDisplayMode: "collapsed",
						themePreference: "system",
					});
					await authComponent.setUserId(ctx, authUser._id, userId);
				},
				onUpdate: async (ctx, newAuthUser, oldAuthUser) => {
					const changed: Record<string, unknown> = {};
					if (newAuthUser.name !== oldAuthUser.name) {
						changed.name = newAuthUser.name;
					}
					if (newAuthUser.email !== oldAuthUser.email) {
						changed.email = newAuthUser.email;
					}
					if (newAuthUser.emailVerified !== oldAuthUser.emailVerified) {
						changed.emailVerified = newAuthUser.emailVerified;
					}
					if (newAuthUser.image !== oldAuthUser.image) {
						changed.image = newAuthUser.image ?? undefined;
					}
					if (Object.keys(changed).length === 0) return;

					const user = await ctx.db
						.query("users")
						.withIndex("by_authId", (q) => q.eq("authId", newAuthUser._id))
						.first();
					if (!user) return;
					await ctx.db.patch(user._id, { ...changed, updatedAt: Date.now() });
				},
				onDelete: async (ctx, authUser) => {
					const user = await ctx.db
						.query("users")
						.withIndex("by_authId", (q) => q.eq("authId", authUser._id))
						.first();
					if (user) {
						await cascadeDeleteUser(ctx, user._id);
					}
				},
			},
		},
	}
);

// Re-export the runtime-side internals the component calls back into.
// `authFunctions: internal.auth` resolves to these.
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuthOptions = (
	ctx: GenericCtx<DataModel>
): BetterAuthOptions => {
	const socialProviders: Record<string, object> = {};

	if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
		socialProviders.google = {
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			prompt: "select_account",
		};
	}

	if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
		socialProviders.apple = {
			clientId: process.env.APPLE_CLIENT_ID,
			clientSecret: process.env.APPLE_CLIENT_SECRET,
		};
	}

	const plugins: NonNullable<BetterAuthOptions["plugins"]> = [
		crossDomain({ siteUrl }),
		convex({ authConfig }),
		passkeyPlugin(),
		admin(),
	];

	if (process.env.RESEND_API_KEY) {
		plugins.push(
			magicLink({
				sendMagicLink: async ({ email, url }) => {
					// Rate-limit per recipient before we touch Resend. Throws a
					// ConvexError on cap, which Better-Auth surfaces to the
					// caller as a sign-in failure — intentionally indistinct
					// from a normal send to avoid leaking whether the email
					// has requested too many links (enumeration).
					//
					// `createAuthOptions` is typed with a generic ctx that
					// could theoretically be a query ctx, but sendMagicLink
					// only fires from the sign-in httpAction (mutation-
					// capable). Narrow the cast here with a comment rather
					// than threading mutation-only ctx through the whole
					// options builder.
					await rateLimiter.limit(
						ctx as Parameters<typeof rateLimiter.limit>[0],
						"magicLinkEmail",
						{ key: email.toLowerCase(), throws: true }
					);

					const fromAddress =
						process.env.EMAIL_FROM ?? "Gloss <noreply@gloss.space>";
					const isProduction = process.env.NODE_ENV === "production";

					const resend = await import("resend").then(
						(m) => new m.Resend(process.env.RESEND_API_KEY)
					);
					await resend.emails
						.send({
							from: fromAddress,
							to: email,
							subject: "Sign in to Gloss",
							html: `
									<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
										<h1 style="font-size: 24px; font-weight: 500; margin-bottom: 24px; color: #1a1a1a;">Sign in to Gloss</h1>
										<p style="font-size: 16px; line-height: 1.5; color: #4a4a4a; margin-bottom: 24px;">
											Click the button below to sign in. This link expires in 10 minutes.
										</p>
										<a href="${url}" style="display: inline-block; background: #1a1a1a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
											Sign in to Gloss
										</a>
										<p style="font-size: 14px; line-height: 1.5; color: #8a8a8a; margin-top: 32px;">
											If you didn't request this email, you can safely ignore it.
										</p>
									</div>
								`,
							headers: isProduction
								? undefined
								: { "X-Entity-Ref-ID": crypto.randomUUID() },
						})
						.catch((err: unknown) =>
							console.error("[auth] Failed to send magic link:", err)
						);
				},
			})
		);
	}

	// Email/password is intentionally OFF — the sign-in surface is social
	// (Google/Apple), magic link, and passkey only. This closes the
	// pre-hijack vector where an attacker registers victim@x.com via
	// unverified email+password and the victim's future Google sign-in
	// auto-links into the attacker's account.
	//
	// For e2e we use Better-Auth's test-utils plugin (registered only when
	// ALLOW_DEV_MINT=true), which mints sessions for existing users via
	// `test.login({ userId })` — no password required. The plugin is wired
	// up in `/api/auth/_dev/create-session` in convex/http.ts. ALLOW_DEV_MINT
	// must NEVER be set on the prod deployment.
	const allowDevMint = process.env.ALLOW_DEV_MINT === "true";
	if (allowDevMint) plugins.push(testUtils());

	return {
		baseURL: process.env.CONVEX_SITE_URL,
		trustedOrigins: [siteUrl, "https://appleid.apple.com", ...extensionOrigins],
		database: authComponent.adapter(ctx),
		// Cookies are issued on the Convex site origin and consumed by the
		// web app (different origin) + the browser extension (different
		// origin). SameSite=None is required for cross-origin cookies to be
		// sent at all — Lax would strand any flow that falls back to real
		// cookies (e.g. the extension service worker, which can't reach the
		// crossDomain plugin's localStorage shim). Secure is required by
		// browsers whenever SameSite=None is set. Better-Auth auto-disables
		// Secure on localhost so dev still works.
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
			},
		},
		socialProviders:
			Object.keys(socialProviders).length > 0 ? socialProviders : undefined,
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["google", "apple"],
			},
		},
		plugins,
	};
};

export const createAuth = (ctx: GenericCtx<DataModel>) =>
	betterAuth(createAuthOptions(ctx));

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return authComponent.getAuthUser(ctx);
	},
});
