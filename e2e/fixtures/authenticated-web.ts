/**
 * Playwright fixture for authenticated web app tests.
 *
 * Authenticates test users via Better-Auth's email/password sign-in
 * against the Convex deployment, then injects session cookies into
 * the browser context.
 */

import { type BrowserContext, type Page, test as base } from "@playwright/test";

import {
	createTestSession,
	deleteTestSession,
	injectSessionCookies,
	type SessionInfo,
} from "./auth";

export const test = base.extend<{
	authenticatedPage: (email: string) => Promise<Page>;
}>({
	authenticatedPage: async ({ browser }, use) => {
		const contexts: BrowserContext[] = [];
		const sessions: SessionInfo[] = [];

		const createAuthPage = async (email: string) => {
			const context = await browser.newContext();
			const session = await createTestSession(email);
			await injectSessionCookies(context, session);
			contexts.push(context);
			sessions.push(session);
			return context.newPage();
		};

		await use(createAuthPage);

		for (const ctx of contexts) {
			await ctx.close();
		}
		for (const s of sessions) {
			await deleteTestSession(s);
		}
	},
});

export { expect } from "@playwright/test";
