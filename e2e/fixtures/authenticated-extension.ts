/**
 * Playwright fixture that extends the base extension fixture with authentication.
 *
 * Provides an `authenticatedAs` function that creates a real database session
 * and injects the cookie into the extension's browser context. Sessions are
 * automatically cleaned up after the test.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/authenticated-extension";
 *   import { SEED_USERS } from "../fixtures/seed-ids";
 *
 *   test("authenticated extension test", async ({ authenticatedAs, page, extensionId }) => {
 *     await authenticatedAs(SEED_USERS.agucova.id);
 *     await page.goto(`chrome-extension://${extensionId}/popup.html`);
 *     // ... test authenticated behavior
 *   });
 */

import {
	createTestSession,
	deleteTestSession,
	injectSessionCookie,
	type SessionInfo,
} from "./auth";
import { test as extensionTest } from "./extension";

export const test = extensionTest.extend<{
	authenticatedAs: (userId: string) => Promise<SessionInfo>;
}>({
	authenticatedAs: async ({ context }, use) => {
		const sessions: SessionInfo[] = [];

		const authenticate = async (userId: string) => {
			const session = await createTestSession(userId);
			await injectSessionCookie(context, session.token);
			sessions.push(session);
			return session;
		};

		await use(authenticate);

		// Cleanup: remove all sessions created during the test
		for (const s of sessions) {
			await deleteTestSession(s.sessionId);
		}
	},
});

export { expect } from "@playwright/test";
