import { expect, test } from "../fixtures/authenticated-extension";
import { SEED_USERS } from "../fixtures/seed-ids";

test.describe("Extension popup — Curius section", () => {
	test("does NOT render Curius section when signed out", async ({
		page,
		extensionId,
	}) => {
		await page.goto(`chrome-extension://${extensionId}/popup.html`);
		await page.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 10_000 }
		);

		// Curius section is auth-gated. The sign-in prompt is what renders.
		await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
		await expect(
			page.getByRole("heading", { name: /^Curius$/i })
		).not.toBeVisible();
	});

	test("renders Curius section with connect form when authenticated + not connected", async ({
		page,
		extensionId,
		authenticatedAs,
	}) => {
		await authenticatedAs(SEED_USERS.alice.email);

		await page.goto(`chrome-extension://${extensionId}/popup.html`);
		await page.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 15_000 }
		);

		// The Curius section heading is specifically styled as a small-caps
		// tracking-wide h2 — match on text rather than role to be resilient.
		await expect(page.locator("h2", { hasText: /^Curius$/i })).toBeVisible({
			timeout: 5_000,
		});

		// A connect affordance exists. The exact button label has changed
		// between "Connect Curius" (email+password) and "Connect via curius.app"
		// (token-read) refactors; accept either.
		await expect(
			page.getByRole("button", {
				name: /connect/i,
			})
		).toBeVisible();
	});
});
