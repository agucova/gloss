/**
 * Playwright fixture for authenticated extension tests.
 *
 * Authenticates test users via Better-Auth's email/password sign-in
 * and injects session cookies into the extension's browser context.
 */

import {
	createTestSession,
	deleteTestSession,
	injectSessionCookies,
	type SessionInfo,
} from "./auth";
import { test as extensionTest } from "./extension";

export const test = extensionTest.extend<{
	authenticatedAs: (email: string) => Promise<SessionInfo>;
}>({
	authenticatedAs: async ({ context }, use) => {
		const sessions: SessionInfo[] = [];

		const authenticate = async (email: string) => {
			const session = await createTestSession(email);
			await injectSessionCookies(context, session);
			sessions.push(session);
			return session;
		};

		await use(authenticate);

		for (const s of sessions) {
			await deleteTestSession(s);
		}
	},
});

export { expect } from "@playwright/test";
