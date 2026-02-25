import { db } from "@gloss/db";
import { session } from "@gloss/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { expect, test } from "../fixtures/authenticated-web";
import { SEED_USERS } from "../fixtures/seed-ids";

test.describe("Web app auth flow", () => {
	test("unauthenticated user navigating to / gets redirected to /login", async ({
		page,
	}) => {
		// Use a plain (unauthenticated) page from the default browser context
		await page.goto("/");

		// The beforeLoad guard on the index route redirects to /login
		await page.waitForURL("**/login", { timeout: 10_000 });
		await expect(page).toHaveURL(/\/login/);

		// Verify the login page content is visible
		await expect(page.getByText("Capture what resonates")).toBeVisible();
	});

	test("authenticated user navigating to /login gets redirected to /", async ({
		authenticatedPage,
	}) => {
		const page = await authenticatedPage(SEED_USERS.agucova.id);

		await page.goto("/login");

		// The login page has a useEffect that redirects to / when session exists
		await page.waitForURL(/\/$/, { timeout: 10_000 });
		await expect(page).toHaveURL(/\/$/);

		// Verify we see dashboard content (the search bar placeholder)
		await expect(page.getByPlaceholder("Search your bookmarks")).toBeVisible({
			timeout: 10_000,
		});
	});

	test("session persists across page navigations", async ({
		authenticatedPage,
	}) => {
		const page = await authenticatedPage(SEED_USERS.agucova.id);

		// Navigate to the dashboard
		await page.goto("/");
		await expect(page.getByPlaceholder("Search your bookmarks")).toBeVisible({
			timeout: 10_000,
		});

		// Navigate to /library (also requires auth)
		await page.goto("/library");

		// If session persists, we should NOT be redirected to /login.
		// The library page should load (it has a beforeLoad auth check too).
		await expect(page).not.toHaveURL(/\/login/);

		// Navigate back to /
		await page.goto("/");
		await expect(page.getByPlaceholder("Search your bookmarks")).toBeVisible({
			timeout: 10_000,
		});
	});

	test("expired session redirects to /login", async ({ browser }) => {
		// Manually create a session that's already expired
		const sessionId = createId();
		const token = createId();
		const now = new Date();
		const expiredAt = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour in the past

		await db.insert(session).values({
			id: sessionId,
			token,
			userId: SEED_USERS.agucova.id,
			expiresAt: expiredAt,
			createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
			updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
			ipAddress: "127.0.0.1",
			userAgent: "Playwright E2E Test (expired)",
		});

		try {
			// Create a context with the expired session cookie injected
			const context = await browser.newContext();
			await context.addCookies([
				{
					name: "better-auth.session_token",
					value: token,
					domain: "localhost",
					path: "/",
					httpOnly: true,
					sameSite: "Lax",
					// Cookie itself isn't expired (browser would drop it), but the
					// server-side session is. Set cookie expiry to the future.
					expires: Math.floor(Date.now() / 1000) + 86400,
				},
			]);

			const page = await context.newPage();
			await page.goto("/");

			// Server should reject the expired session and the app should redirect to /login
			await page.waitForURL("**/login", { timeout: 15_000 });
			await expect(page).toHaveURL(/\/login/);

			await context.close();
		} finally {
			// Clean up the expired session from the database
			await db.delete(session).where(eq(session.id, sessionId));
		}
	});
});
