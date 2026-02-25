import { expect, test } from "../fixtures/extension";

test.describe("Extension newtab page", () => {
	test("newtab page loads and shows the Gloss UI", async ({
		page,
		extensionId,
	}) => {
		await page.goto(`chrome-extension://${extensionId}/newtab.html`);

		// The newtab page should render something visible
		// When unauthenticated, it shows a sign-in prompt with the logo
		await page.waitForLoadState("domcontentloaded");

		// Either the dashboard loads (authenticated) or the unauthenticated state shows
		// Both contain the Gloss logo
		const logo = page.locator("svg").first();
		await expect(logo).toBeVisible({ timeout: 10_000 });
	});

	test("newtab shows sign-in prompt when unauthenticated", async ({
		page,
		extensionId,
	}) => {
		await page.goto(`chrome-extension://${extensionId}/newtab.html`);

		// Wait for the auth check to complete
		await page.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 10_000 }
		);

		// When not authenticated, should show "Sign in to see your dashboard"
		const signInText = page.getByText("Sign in to see your dashboard");
		await expect(signInText).toBeVisible({ timeout: 5_000 });
	});
});
