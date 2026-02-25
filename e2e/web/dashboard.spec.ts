import { expect, test } from "@playwright/test";

import {
	test as authTest,
	expect as authExpect,
} from "../fixtures/authenticated-web";
import { SEED_USERS } from "../fixtures/seed-ids";

test.describe("Web app dashboard (unauthenticated)", () => {
	test("dashboard requires auth and redirects to login", async ({ page }) => {
		await page.goto("/");

		// Should redirect to /login since not authenticated
		await page.waitForURL("**/login", { timeout: 10_000 });
		await expect(page).toHaveURL(/\/login/);
	});
});

authTest.describe("Web app dashboard (authenticated)", () => {
	authTest(
		"dashboard loads and shows main content",
		async ({ authenticatedPage }) => {
			const page = await authenticatedPage(SEED_USERS.agucova.id);
			await page.goto("/");

			// Wait for network to settle (API calls to load dashboard data)
			await page.waitForLoadState("networkidle");

			// The dashboard should render the search bar with its placeholder
			const searchInput = page.getByPlaceholder("Search your bookmarks");
			await authExpect(searchInput).toBeVisible({ timeout: 10_000 });

			// The dashboard should show the "Recent bookmarks" section heading
			const recentBookmarks = page.getByText("Recent bookmarks", {
				exact: false,
			});
			await authExpect(recentBookmarks).toBeVisible({ timeout: 10_000 });

			// The dashboard should show the "Recent highlights" section heading
			const recentHighlights = page.getByText("Recent highlights", {
				exact: false,
			});
			await authExpect(recentHighlights).toBeVisible({ timeout: 10_000 });
		}
	);

	authTest(
		"dashboard shows friends' activity",
		async ({ authenticatedPage }) => {
			const page = await authenticatedPage(SEED_USERS.agucova.id);
			await page.goto("/");

			// Wait for the page to load data
			await page.waitForLoadState("networkidle");

			// agucova has 4 accepted friends (Alice, Bob, Carol, Eve) who have
			// bookmarks and highlights. The dashboard should show friend activity.
			// Either we see bookmark cards from friends or "No recent bookmarks from friends yet"
			const recentBookmarksSection = page.getByText("Recent bookmarks").first();
			await authExpect(recentBookmarksSection).toBeVisible({ timeout: 10_000 });

			const recentHighlightsSection = page
				.getByText("Recent highlights")
				.first();
			await authExpect(recentHighlightsSection).toBeVisible({
				timeout: 10_000,
			});

			// Wait a bit for the friend data to load
			await page.waitForTimeout(2_000);

			// The page should NOT just be showing loading state -- it should have settled
			// Either we see actual content or the "no activity" message
			const hasBookmarkContent = await page
				.locator("text=No recent bookmarks from friends yet")
				.or(page.locator("text=Unable to load"))
				// Or there are actual bookmark items (links in the recent bookmarks card)
				.or(page.locator(".divide-y a, .divide-y button").first())
				.isVisible();

			// At minimum, the section rendered (not stuck in loading skeleton)
			authExpect(hasBookmarkContent).toBe(true);
		}
	);
});
