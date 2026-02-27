import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins";

import type { DataModel } from "./_generated/dataModel";

import { components } from "./_generated/api";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	// Build social providers dynamically
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

	// Build plugins
	const plugins: Parameters<typeof betterAuth>[0]["plugins"] = [
		crossDomain({ siteUrl }),
		convex({ authConfig }),
		passkeyPlugin(),
	];

	// Add magic link if Resend is configured
	if (process.env.RESEND_API_KEY) {
		plugins.push(
			magicLink({
				sendMagicLink: async ({ email, url }) => {
					const fromAddress =
						process.env.EMAIL_FROM ?? "Gloss <noreply@gloss.agus.sh>";
					const isProduction = process.env.NODE_ENV === "production";

					// Use Resend directly since we're in an action context
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

	return betterAuth({
		trustedOrigins: [siteUrl, "https://appleid.apple.com"],
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
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
	});
};

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return authComponent.getAuthUser(ctx);
	},
});
