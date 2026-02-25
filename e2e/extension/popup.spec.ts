import { expect, test } from "../fixtures/extension";

test.describe("Extension popup", () => {
	test("popup page loads and displays the Gloss header", async ({
		page,
		extensionId,
	}) => {
		await page.goto(`chrome-extension://${extensionId}/popup.html`);

		// The popup should render the Gloss logo in the header
		const header = page.locator("header");
		await expect(header).toBeVisible({ timeout: 5_000 });

		// The popup should contain the logo SVG
		const logo = header.locator("svg");
		await expect(logo).toBeVisible();
	});

	test("popup shows sign-in prompt when unauthenticated", async ({
		page,
		extensionId,
	}) => {
		await page.goto(`chrome-extension://${extensionId}/popup.html`);

		// Wait for loading to finish (the popup starts in a loading state)
		await page.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 10_000 }
		);

		// When not authenticated, the popup should show a sign-in prompt
		const signInButton = page.getByRole("button", { name: /sign in/i });
		await expect(signInButton).toBeVisible({ timeout: 5_000 });
	});

	test("popup settings section is toggleable", async ({
		page,
		extensionId,
	}) => {
		await page.goto(`chrome-extension://${extensionId}/popup.html`);

		// Wait for loading to complete
		await page.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 10_000 }
		);

		// The settings section should be present but collapsed
		const settingsToggle = page.getByText("Settings");
		await expect(settingsToggle).toBeVisible();

		// Theme selector should NOT be visible before clicking
		const themeLabel = page.getByText("Theme");
		await expect(themeLabel).not.toBeVisible();

		// Click to expand settings
		await settingsToggle.click();

		// Now the theme selector and server URL input should be visible
		await expect(themeLabel).toBeVisible();
		await expect(page.getByText("Server URL")).toBeVisible();
	});
});
