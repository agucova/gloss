/**
 * Session injection utilities for E2E tests.
 *
 * Creates real database sessions and injects the corresponding cookie
 * into Playwright browser contexts, enabling authenticated test flows
 * without going through the login UI.
 */

import type { BrowserContext } from "@playwright/test";

import { db } from "@gloss/db";
import { session } from "@gloss/db/schema";
import { env } from "@gloss/env/server";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { createHmac } from "node:crypto";

/**
 * Sign a session token the same way Better-Auth does internally.
 * Better-Auth cookie values are `token.signature` where signature
 * is HMAC-SHA256(token, secret) base64-encoded.
 */
function signSessionToken(token: string, secret: string): string {
	const signature = createHmac("sha256", secret).update(token).digest("base64");
	return `${token}.${signature}`;
}

export interface SessionInfo {
	sessionId: string;
	token: string;
	userId: string;
}

/**
 * Insert a session row into the database for the given user.
 * Returns the session ID and token needed for cookie injection.
 */
export async function createTestSession(userId: string): Promise<SessionInfo> {
	const sessionId = createId();
	const token = createId();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24 hours

	await db.insert(session).values({
		id: sessionId,
		token,
		userId,
		expiresAt,
		createdAt: now,
		updatedAt: now,
		ipAddress: "127.0.0.1",
		userAgent: "Playwright E2E Test",
	});

	return { sessionId, token, userId };
}

/**
 * Delete a test session from the database.
 */
export async function deleteTestSession(sessionId: string): Promise<void> {
	await db.delete(session).where(eq(session.id, sessionId));
}

/**
 * Inject the Better-Auth session cookie into a Playwright browser context.
 * Better-Auth uses signed cookies: the value is `token.signature` where
 * the signature is an HMAC of the token using BETTER_AUTH_SECRET.
 */
export async function injectSessionCookie(
	context: BrowserContext,
	token: string
): Promise<void> {
	const signedValue = signSessionToken(token, env.BETTER_AUTH_SECRET);

	await context.addCookies([
		{
			name: "better-auth.session_token",
			value: signedValue,
			domain: "localhost",
			path: "/",
			httpOnly: true,
			sameSite: "Lax",
			expires: Math.floor(Date.now() / 1000) + 86400,
		},
	]);
}
