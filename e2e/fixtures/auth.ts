/**
 * Session injection utilities for E2E tests.
 *
 * Authenticates test users by calling Better-Auth's sign-in API
 * running on the Convex site URL. The response sets session cookies
 * that can be injected into Playwright browser contexts.
 */

import type { BrowserContext } from "@playwright/test";

// Convex site URL where Better-Auth HTTP actions are registered
const CONVEX_SITE_URL =
	process.env.VITE_CONVEX_SITE_URL || "https://glorious-toad-644.convex.site";

export interface SessionInfo {
	userId: string;
	email: string;
	cookies: Array<{
		name: string;
		value: string;
		domain: string;
		path: string;
	}>;
}

/**
 * Authenticate a test user by calling Better-Auth's email/password sign-in.
 * All seed users use password "password123".
 *
 * Returns session cookies that can be injected into browser contexts.
 */
export async function createTestSession(email: string): Promise<SessionInfo> {
	const response = await fetch(`${CONVEX_SITE_URL}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email,
			password: "password123",
		}),
		redirect: "manual",
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(
			`Failed to sign in as ${email}: ${response.status} ${text}`
		);
	}

	// Extract session cookies from response
	const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
	const cookies: SessionInfo["cookies"] = [];

	for (const header of setCookieHeaders) {
		const [nameValue, ...parts] = header.split(";");
		const [name, value] = (nameValue ?? "").split("=", 2);
		if (name && value) {
			let domain = "localhost";
			let path = "/";
			for (const part of parts) {
				const trimmed = part.trim();
				if (trimmed.toLowerCase().startsWith("domain=")) {
					domain = trimmed.slice(7);
				} else if (trimmed.toLowerCase().startsWith("path=")) {
					path = trimmed.slice(5);
				}
			}
			cookies.push({ name: name.trim(), value: value.trim(), domain, path });
		}
	}

	// Also try to get user info from the response body
	let userId = "";
	try {
		const body = await response.json();
		userId = body?.user?.id ?? body?.session?.userId ?? "";
	} catch {
		// Response might not be JSON
	}

	return { userId, email, cookies };
}

/**
 * Delete a test session. With Convex + Better-Auth, sessions are managed
 * by the auth component. We call the sign-out endpoint.
 */
export async function deleteTestSession(
	_sessionInfo: SessionInfo
): Promise<void> {
	// Better-Auth sessions expire naturally.
	// In tests, we just close the browser context which discards cookies.
}

/**
 * Inject session cookies into a Playwright browser context.
 */
export async function injectSessionCookies(
	context: BrowserContext,
	sessionInfo: SessionInfo
): Promise<void> {
	if (sessionInfo.cookies.length > 0) {
		await context.addCookies(
			sessionInfo.cookies.map((c) => ({
				name: c.name,
				value: c.value,
				domain: c.domain,
				path: c.path,
				httpOnly: true,
				sameSite: "Lax" as const,
				expires: Math.floor(Date.now() / 1000) + 86400,
			}))
		);
	}
}
