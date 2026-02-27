import { expect, test } from "../fixtures/authenticated-extension";
import { SEED_USERS } from "../fixtures/seed-ids";

test.describe("Extension newtab search", () => {
	test.setTimeout(30_000);

	test("newtab search activates results layout", async ({
		authenticatedAs,
		page,
		extensionId,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);

		await page.goto(`chrome-extension://${extensionId}/newtab.html`);
		await page.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 10_000 }
		);

		const searchInput = page.getByPlaceholder("Search your bookmarks");
		await expect(searchInput).toBeVisible({ timeout: 10_000 });

		// Verify dashboard is initially showing
		await expect(
			page.getByText("Recent bookmarks", { exact: false })
		).toBeVisible({ timeout: 10_000 });

		// Type a query — should switch to search results
		await searchInput.fill("work");

		// Search mode should replace the dashboard feed with results or no-results
		const searchExecuted = page
			.getByRole("heading", { name: "Bookmarks" })
			.or(page.getByRole("heading", { name: "Highlights" }))
			.or(page.getByText(/no results found/i));

		await expect(searchExecuted.first()).toBeVisible({ timeout: 10_000 });

		// Dashboard sections should be hidden while searching
		await expect(
			page.getByText("Recent bookmarks", { exact: false })
		).not.toBeVisible();
	});

	test("newtab clearing search restores dashboard", async ({
		authenticatedAs,
		page,
		extensionId,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);

		await page.goto(`chrome-extension://${extensionId}/newtab.html`);
		await page.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 10_000 }
		);

		const searchInput = page.getByPlaceholder("Search your bookmarks");
		await expect(searchInput).toBeVisible({ timeout: 10_000 });

		// Search
		await searchInput.fill("work");
		await expect(
			page.getByText("Recent bookmarks", { exact: false })
		).not.toBeVisible({ timeout: 10_000 });

		// Clear
		await searchInput.fill("");

		// Dashboard should return
		await expect(
			page.getByText("Recent bookmarks", { exact: false })
		).toBeVisible({ timeout: 10_000 });
	});
});
