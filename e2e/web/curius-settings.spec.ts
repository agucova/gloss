import {
	expect as authExpect,
	test as authTest,
} from "../fixtures/authenticated-web";
import { SEED_USERS } from "../fixtures/seed-ids";

authTest.describe("Web settings — Curius section", () => {
	authTest(
		"renders the Curius section heading and explainer for authenticated users",
		async ({ authenticatedPage }) => {
			const page = await authenticatedPage(SEED_USERS.agucova.email);
			await page.goto("/settings");
			await page.waitForLoadState("networkidle");

			// First-class section heading (H2, matching the plan's "not a
			// connected-services list" requirement).
			await authExpect(
				page.getByRole("heading", { name: /^Curius$/i })
			).toBeVisible({ timeout: 10_000 });
			await authExpect(page.getByText(/Your Curius account/i)).toBeVisible();
		}
	);

	authTest(
		"shows 'Install the Gloss extension' copy when the extension isn't detected",
		async ({ authenticatedPage }) => {
			const page = await authenticatedPage(SEED_USERS.agucova.email);
			await page.goto("/settings");
			await page.waitForLoadState("networkidle");

			// Playwright's headless Chromium doesn't install our extension on
			// web-only tests, so the ping times out and we fall through to the
			// install prompt. This verifies the fallback doesn't regress to
			// a raw-JWT form or similar.
			await authExpect(
				page.getByText(/Install the Gloss extension/i)
			).toBeVisible({ timeout: 10_000 });
			// No "Connect" button should surface when the extension isn't
			// detected — the connect path MUST go through the extension.
			await authExpect(
				page.getByRole("button", { name: /Connect Curius/i })
			).toHaveCount(0);
		}
	);
});
