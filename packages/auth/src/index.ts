import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { db } from "@gloss/db";
import {
	account,
	accountRelations,
	passkeyRelations,
	passkey as passkeyTable,
	session,
	sessionRelations,
	user,
	userRelations,
	verification,
} from "@gloss/db/schema/auth";
import { env } from "@gloss/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, magicLink } from "better-auth/plugins";
import { Resend } from "resend";

const schema = {
	user,
	session,
	account,
	verification,
	passkey: passkeyTable,
	userRelations,
	sessionRelations,
	accountRelations,
	passkeyRelations,
};

const isProduction = env.NODE_ENV === "production";

// Agustín's seed ID for admin access in dev
const ADMIN_USER_ID = "seed_agucova00000000000000";

// Initialize Resend if API key is configured
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Build social providers dynamically based on available env vars
const socialProviders: Record<string, object> = {};

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
	socialProviders.google = {
		clientId: env.GOOGLE_CLIENT_ID,
		clientSecret: env.GOOGLE_CLIENT_SECRET,
		prompt: "select_account",
	};
}

if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
	socialProviders.apple = {
		clientId: env.APPLE_CLIENT_ID,
		clientSecret: env.APPLE_CLIENT_SECRET,
	};
}

// Build plugins array
const plugins: Parameters<typeof betterAuth>[0]["plugins"] = [
	passkeyPlugin(), // WebAuthn passkeys
	// Admin plugin for dev impersonation (only effective when user has admin role)
	admin({
		adminUserIds: [ADMIN_USER_ID],
		impersonationSessionDuration: 60 * 60 * 24, // 24 hours
	}),
];

// Add magic link if Resend is configured
if (resend) {
	console.log("[auth] Magic link plugin enabled (Resend configured)");
	plugins.push(
		magicLink({
			sendMagicLink: ({ email, url }) => {
				const fromAddress = env.EMAIL_FROM ?? "Gloss <noreply@gloss.agus.sh>";
				// Fire-and-forget to prevent timing attacks
				resend.emails
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
						// Disable click tracking in dev (Resend can't redirect to localhost)
						headers: isProduction
							? undefined
							: { "X-Entity-Ref-ID": crypto.randomUUID() },
					})
					.catch((err) =>
						console.error("[auth] Failed to send magic link:", err)
					);
			},
		})
	);
} else {
	console.log("[auth] Magic link plugin disabled (RESEND_API_KEY not set)");
}

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	// Apple Sign In requires appleid.apple.com as trusted origin
	trustedOrigins: [env.VITE_WEB_URL, "https://appleid.apple.com"],

	// Social providers (Google, Apple)
	socialProviders:
		Object.keys(socialProviders).length > 0 ? socialProviders : undefined,

	// Account linking for users with same email across providers
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google", "apple"],
		},
	},

	advanced: {
		defaultCookieAttributes: {
			sameSite: isProduction ? "none" : "lax",
			secure: isProduction,
			httpOnly: true,
		},
	},

	plugins,
});
