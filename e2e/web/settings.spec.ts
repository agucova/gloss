import { expect, test } from "@playwright/test";

import {
	test as authTest,
	expect as authExpect,
} from "../fixtures/authenticated-web";
import { SEED_USERS } from "../fixtures/seed-ids";

test.describe("Web app settings (unauthenticated)", () => {
	test("settings page requires auth and redirects to login", async ({
		page,
	}) => {
		await page.goto("/settings");

		// Should redirect to /login since not authenticated
		await page.waitForURL("**/login", { timeout: 10_000 });
		await expect(page).toHaveURL(/\/login/);
	});
});

authTest.describe("Web app settings (authenticated)", () => {
	authTest(
		"settings page loads with preference controls",
		async ({ authenticatedPage }) => {
			const page = await authenticatedPage(SEED_USERS.agucova.id);
			await page.goto("/settings");

			// Wait for the settings to load
			await page.waitForLoadState("networkidle");

			// Page should show "Settings" heading
			const heading = page.getByRole("heading", { name: "Settings" });
			await authExpect(heading).toBeVisible({ timeout: 10_000 });

			// Should show "Privacy" section heading
			const privacyHeading = page.getByRole("heading", {
				name: "Privacy",
			});
			await authExpect(privacyHeading).toBeVisible();

			// Should show "Display" section heading
			const displayHeading = page.getByRole("heading", {
				name: "Display",
			});
			await authExpect(displayHeading).toBeVisible();

			// Should show privacy setting labels
			await authExpect(
				page.getByText("Profile", { exact: true })
			).toBeVisible();
			await authExpect(
				page.getByText("Who can view your profile page")
			).toBeVisible();

			await authExpect(
				page.getByText("Who can see your highlights on pages")
			).toBeVisible();

			await authExpect(
				page.getByText("Who can see your saved bookmarks")
			).toBeVisible();

			// Should show display setting labels
			await authExpect(
				page.getByText("Whose highlights appear on pages")
			).toBeVisible();

			await authExpect(
				page.getByText("How comment threads appear by default")
			).toBeVisible();

			// Should show "Save changes" button
			const saveButton = page.getByRole("button", {
				name: /save changes/i,
			});
			await authExpect(saveButton).toBeVisible();

			// "Back to profile" link should be visible
			const backLink = page.getByText("Back to profile");
			await authExpect(backLink).toBeVisible();
		}
	);

	authTest(
		"can update a setting and verify it persists on reload",
		async ({ authenticatedPage }) => {
			const page = await authenticatedPage(SEED_USERS.agucova.id);
			await page.goto("/settings");
			await page.waitForLoadState("networkidle");

			// Wait for settings to load (heading should be visible)
			await authExpect(
				page.getByRole("heading", { name: "Settings" })
			).toBeVisible({ timeout: 10_000 });

			// Find the "Show highlights from" select (highlightDisplayFilter)
			const highlightFilterSelect = page.locator("#highlightDisplayFilter");
			await authExpect(highlightFilterSelect).toBeVisible({
				timeout: 5_000,
			});

			// Get the current value
			const currentValue = await highlightFilterSelect.inputValue();

			// Change to a different value
			const newValue = currentValue === "friends" ? "me" : "friends";
			await highlightFilterSelect.selectOption(newValue);

			// The form should now indicate unsaved changes
			await authExpect(page.getByText("You have unsaved changes")).toBeVisible({
				timeout: 5_000,
			});

			// Click "Save changes"
			const saveButton = page.getByRole("button", {
				name: /save changes/i,
			});
			await saveButton.click();

			// Wait for save to complete -- a toast notification should appear
			await authExpect(page.getByText("Settings saved")).toBeVisible({
				timeout: 10_000,
			});

			// Reload the page to verify persistence
			await page.reload();
			await page.waitForLoadState("networkidle");

			// Wait for settings to load again
			await authExpect(
				page.getByRole("heading", { name: "Settings" })
			).toBeVisible({ timeout: 10_000 });

			// The select should retain the new value
			const reloadedSelect = page.locator("#highlightDisplayFilter");
			await authExpect(reloadedSelect).toHaveValue(newValue, {
				timeout: 5_000,
			});

			// Clean up: reset to the original value
			await reloadedSelect.selectOption(currentValue);
			await page.getByRole("button", { name: /save changes/i }).click();
			await authExpect(page.getByText("Settings saved")).toBeVisible({
				timeout: 10_000,
			});
		}
	);
});
