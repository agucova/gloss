import {
	expect as authExpect,
	test as authTest,
} from "../fixtures/authenticated-web";
import { SEED_USERS } from "../fixtures/seed-ids";

authTest.describe("Web app search", () => {
	authTest.setTimeout(30_000);

	authTest(
		"search bar accepts input and shows results layout",
		async ({ authenticatedPage }) => {
			const page = await authenticatedPage(SEED_USERS.agucova.id);
			await page.goto("/");
			await page.waitForLoadState("networkidle");

			const searchInput = page.getByPlaceholder("Search your bookmarks");
			await authExpect(searchInput).toBeVisible({ timeout: 10_000 });

			// Type a query — the dashboard should switch from feed view to search results
			await searchInput.fill("work");

			// The search results layout renders "Bookmarks" and/or "Highlights" headings,
			// or a "No results found" message. Either means search executed successfully.
			const searchExecuted = page
				.getByRole("heading", { name: "Bookmarks" })
				.or(page.getByRole("heading", { name: "Highlights" }))
				.or(page.getByText(/no results found/i));

			await authExpect(searchExecuted.first()).toBeVisible({
				timeout: 10_000,
			});

			// The default dashboard sections ("Recent bookmarks") should NOT be visible
			await authExpect(
				page.getByText("Recent bookmarks", { exact: false })
			).not.toBeVisible();
		}
	);

	authTest(
		"clearing search returns to dashboard",
		async ({ authenticatedPage }) => {
			const page = await authenticatedPage(SEED_USERS.agucova.id);
			await page.goto("/");
			await page.waitForLoadState("networkidle");

			const searchInput = page.getByPlaceholder("Search your bookmarks");
			await authExpect(searchInput).toBeVisible({ timeout: 10_000 });

			// Verify dashboard is showing
			await authExpect(
				page.getByText("Recent bookmarks", { exact: false })
			).toBeVisible({ timeout: 10_000 });

			// Search for something
			await searchInput.fill("work");

			// Wait for search mode to activate
			await authExpect(
				page.getByText("Recent bookmarks", { exact: false })
			).not.toBeVisible({ timeout: 10_000 });

			// Clear the search
			await searchInput.fill("");

			// Dashboard content should return
			await authExpect(
				page.getByText("Recent bookmarks", { exact: false })
			).toBeVisible({ timeout: 10_000 });
		}
	);
});
