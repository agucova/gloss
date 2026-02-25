import { expect, test } from "../fixtures/authenticated-extension";
import { SEED_USERS } from "../fixtures/seed-ids";

test.describe("Extension popup — authenticated", () => {
	test.setTimeout(30_000);

	test("popup shows user name when authenticated", async ({
		authenticatedAs,
		page,
		extensionId,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);

		await page.goto(`chrome-extension://${extensionId}/popup.html`);

		// Wait for loading to finish
		await page.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 10_000 }
		);

		// When authenticated, the popup should show "Recent highlights" section
		// (only rendered when authState.authenticated is true)
		await expect(page.getByText("Recent highlights")).toBeVisible({
			timeout: 5_000,
		});

		// Expand settings to see the account info with the user's name
		await page.getByText("Settings").click();

		// The settings panel shows the user's name when authenticated
		await expect(page.getByText(SEED_USERS.agucova.name)).toBeVisible({
			timeout: 5_000,
		});
	});

	test("sign out button is visible in settings", async ({
		authenticatedAs,
		page,
		extensionId,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);

		await page.goto(`chrome-extension://${extensionId}/popup.html`);

		// Wait for loading to finish
		await page.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 10_000 }
		);

		// The "Sign in" button should NOT be visible (it's the unauthenticated state)
		await expect(
			page.getByRole("button", { name: /sign in/i })
		).not.toBeVisible();

		// Expand settings to see the sign out button
		await page.getByText("Settings").click();

		// The "Sign out" button should be visible in the account info section
		await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible({
			timeout: 5_000,
		});
	});

	test("clicking sign out clears session and reverts to unauthenticated state", async ({
		authenticatedAs,
		page,
		extensionId,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);

		await page.goto(`chrome-extension://${extensionId}/popup.html`);

		// Wait for loading to finish
		await page.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 10_000 }
		);

		// Confirm we're in authenticated state first
		await expect(page.getByText("Recent highlights")).toBeVisible({
			timeout: 5_000,
		});

		// Expand settings and click sign out
		await page.getByText("Settings").click();
		const signOutButton = page.getByRole("button", { name: /sign out/i });
		await expect(signOutButton).toBeVisible({ timeout: 5_000 });
		await signOutButton.click();

		// After signing out, the popup should revert to showing the sign-in prompt
		// "Sign in to bookmark and highlight" is the unauthenticated prompt text
		await expect(
			page.getByText("Sign in to bookmark and highlight")
		).toBeVisible({ timeout: 10_000 });

		// The "Recent highlights" section should no longer be visible
		await expect(page.getByText("Recent highlights")).not.toBeVisible();
	});
});
