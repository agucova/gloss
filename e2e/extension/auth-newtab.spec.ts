import { expect, test } from "../fixtures/authenticated-extension";
import { SEED_USERS } from "../fixtures/seed-ids";

test.describe("Extension newtab — authenticated", () => {
	test.setTimeout(30_000);

	test("newtab shows authenticated content instead of sign-in prompt", async ({
		authenticatedAs,
		page,
		extensionId,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);

		await page.goto(`chrome-extension://${extensionId}/newtab.html`);

		// Wait for the auth check to complete (loading state disappears)
		await page.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 10_000 }
		);

		// The unauthenticated prompt should NOT be visible
		await expect(
			page.getByText("Sign in to see your dashboard")
		).not.toBeVisible();

		// The header should show "Open Gloss" link (only rendered in authenticated state)
		await expect(page.getByText("Open Gloss")).toBeVisible({ timeout: 5_000 });
	});

	test("newtab renders dashboard content when authenticated", async ({
		authenticatedAs,
		page,
		extensionId,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);

		await page.goto(`chrome-extension://${extensionId}/newtab.html`);

		// Wait for loading to finish
		await page.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 10_000 }
		);

		// The Dashboard component renders a search bar with this placeholder
		await expect(page.getByPlaceholder("Search your bookmarks")).toBeVisible({
			timeout: 10_000,
		});

		// Dashboard sections should be rendered (headings from RecentLinks and RecentHighlights)
		await expect(page.getByText("Recent bookmarks")).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByText("Recent highlights")).toBeVisible({
			timeout: 10_000,
		});
	});
});
