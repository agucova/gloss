import { expect, test } from "@playwright/test";

test.describe("Web app login page", () => {
	test("login page loads with logo and auth options", async ({ page }) => {
		await page.goto("/login");

		// Wait for the page to settle (session check etc.)
		await page.waitForLoadState("networkidle");

		// The login page should show the Gloss logo
		const logo = page.locator("svg").first();
		await expect(logo).toBeVisible({ timeout: 5_000 });

		// Should show "Capture what resonates" tagline
		await expect(page.getByText("Capture what resonates")).toBeVisible();

		// Should show Google sign-in button
		const googleButton = page.getByRole("button", {
			name: /continue with google/i,
		});
		await expect(googleButton).toBeVisible();

		// Should show Apple sign-in button
		const appleButton = page.getByRole("button", {
			name: /continue with apple/i,
		});
		await expect(appleButton).toBeVisible();

		// Should show magic link email form
		const emailInput = page.getByPlaceholder("you@example.com");
		await expect(emailInput).toBeVisible();

		// Should show "Send magic link" submit button (exact match to avoid
		// matching the dev impersonation panel button in dev mode)
		const magicLinkButton = page.getByRole("button", {
			name: "Send magic link",
			exact: true,
		});
		await expect(magicLinkButton).toBeVisible();

		// Should show passkey sign-in option
		const passkeyButton = page.getByRole("button", {
			name: /sign in with passkey/i,
		});
		await expect(passkeyButton).toBeVisible();
	});

	test("magic link form accepts email input and submit button works", async ({
		page,
	}) => {
		await page.goto("/login");
		await page.waitForLoadState("networkidle");

		// The email input should be interactable
		const emailInput = page.getByPlaceholder("you@example.com");
		await expect(emailInput).toBeVisible();
		await emailInput.fill("user@example.com");
		await expect(emailInput).toHaveValue("user@example.com");

		// The submit button should be enabled when the form can be submitted
		const submitButton = page.getByRole("button", {
			name: "Send magic link",
			exact: true,
		});
		await expect(submitButton).toBeEnabled();
	});

	test("unauthenticated users are redirected from home to login", async ({
		page,
	}) => {
		await page.goto("/");

		// Should redirect to /login since not authenticated
		await page.waitForURL("**/login", { timeout: 10_000 });
		await expect(page).toHaveURL(/\/login/);
	});
});
