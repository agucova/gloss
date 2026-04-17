/**
 * Session injection utilities for E2E tests.
 *
 * Seed users are credential-less by design — the app's intended sign-in
 * paths are magic link, Google/Apple social, passkey, and admin
 * impersonation. Tests use a dev-only HTTP endpoint
 * (`/api/auth/_dev/create-session`, gated by `ALLOW_DEV_MINT=true`) that
 * calls Better-Auth's testUtils plugin to mint a session cookie from the
 * user's id — no password involved.
 *
 * The web app uses `@convex-dev/better-auth`'s crossDomain plugin, which
 * keeps the session in **localStorage** under `better-auth_cookie` (JSON,
 * with the shape `{ [name]: { value, expires } }`) rather than a browser
 * cookie, and sends it to Convex via a custom `Better-Auth-Cookie` header.
 * So to pose as a seed user in Playwright we seed localStorage via
 * `addInitScript` before any navigation on the web origin.
 */

import type { BrowserContext } from "@playwright/test";

const CONVEX_SITE_URL =
	process.env.VITE_CONVEX_SITE_URL || "https://glorious-toad-644.convex.site";
const ORIGIN = process.env.VITE_WEB_URL ?? "http://localhost:3001";

interface SessionCookie {
	name: string;
	value: string;
	domain: string;
	path: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "Lax" | "Strict" | "None";
	expires?: number;
}

export interface SessionInfo {
	userId: string;
	email: string;
	cookies: SessionCookie[];
	/** Ready-to-inject JSON for the `better-auth_cookie` localStorage entry. */
	authCookieJson: string;
}

function cookiesToAuthCookieJson(cookies: SessionCookie[]): string {
	const entries: Record<string, { value: string; expires: string | null }> = {};
	for (const c of cookies) {
		entries[c.name] = {
			value: c.value,
			expires: c.expires ? new Date(c.expires * 1000).toISOString() : null,
		};
	}
	return JSON.stringify(entries);
}

/**
 * Create a Better-Auth session for a seed user via the dev endpoint.
 * Requires `ALLOW_DEV_MINT=true` on the target Convex deployment so the
 * testUtils plugin is registered.
 */
export async function createTestSession(email: string): Promise<SessionInfo> {
	const response = await fetch(
		`${CONVEX_SITE_URL}/api/auth/_dev/create-session`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: ORIGIN },
			body: JSON.stringify({ email }),
			redirect: "manual",
		}
	);
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(
			`_dev/create-session failed for ${email}: ${response.status} ${text}\n` +
				"Is ALLOW_DEV_MINT=true set on the Convex backend?"
		);
	}
	const { cookies } = (await response.json()) as {
		cookies: SessionCookie[];
	};
	return {
		email,
		userId: "",
		cookies,
		authCookieJson: cookiesToAuthCookieJson(cookies),
	};
}

export async function deleteTestSession(
	_sessionInfo: SessionInfo
): Promise<void> {}

/**
 * Prime the browser context so the web app reads a valid Better-Auth
 * session. This seeds `localStorage["better-auth_cookie"]` on the web origin
 * (where the crossDomain client reads it) and also drops the cookie on the
 * convex.site domain so any direct navigation to Convex URLs carries auth.
 */
export async function injectSessionCookies(
	context: BrowserContext,
	sessionInfo: SessionInfo
): Promise<void> {
	if (sessionInfo.cookies.length === 0) return;

	await context.addCookies(
		sessionInfo.cookies.map((c) => ({
			name: c.name,
			value: c.value,
			domain: c.domain || "localhost",
			path: c.path || "/",
			httpOnly: c.httpOnly ?? true,
			secure: c.secure ?? false,
			sameSite: c.sameSite ?? ("Lax" as const),
			expires: c.expires ?? Math.floor(Date.now() / 1000) + 86400,
		}))
	);

	const json = sessionInfo.authCookieJson;
	await context.addInitScript((cookieJson: string) => {
		try {
			window.localStorage.setItem("better-auth_cookie", cookieJson);
		} catch {}
	}, json);
}
