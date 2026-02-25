/**
 * Playwright fixture for authenticated web app tests.
 *
 * Provides an `authenticatedPage` function that creates a new browser context
 * with a real database session injected via cookie. Each call returns a fresh
 * Page ready to use. All contexts and sessions are cleaned up after the test.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/authenticated-web";
 *   import { SEED_USERS } from "../fixtures/seed-ids";
 *
 *   test("authenticated web test", async ({ authenticatedPage }) => {
 *     const page = await authenticatedPage(SEED_USERS.agucova.id);
 *     await page.goto("/");
 *     // ... test authenticated behavior
 *   });
 */

import { type BrowserContext, type Page, test as base } from "@playwright/test";

import {
	createTestSession,
	deleteTestSession,
	injectSessionCookie,
	type SessionInfo,
} from "./auth";

export const test = base.extend<{
	authenticatedPage: (userId: string) => Promise<Page>;
}>({
	authenticatedPage: async ({ browser }, use) => {
		const contexts: BrowserContext[] = [];
		const sessions: SessionInfo[] = [];

		const createAuthPage = async (userId: string) => {
			const context = await browser.newContext();
			const session = await createTestSession(userId);
			await injectSessionCookie(context, session.token);
			contexts.push(context);
			sessions.push(session);
			return context.newPage();
		};

		await use(createAuthPage);

		// Cleanup: close all contexts and remove all sessions
		for (const ctx of contexts) {
			await ctx.close();
		}
		for (const s of sessions) {
			await deleteTestSession(s.sessionId);
		}
	},
});

export { expect } from "@playwright/test";
