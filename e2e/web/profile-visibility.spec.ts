/**
 * E2E coverage for profileVisibility enforcement.
 *
 * The app's user table stores a per-user `profileVisibility` value
 * (public | friends | private). Before the hardening pass the value was
 * stored but not enforced — any authenticated viewer could see any
 * profile. These tests lock in the enforced behavior:
 *   - friends-only profiles 404 for non-friends (even logged in)
 *   - private profiles 404 for everyone except the owner
 *
 * Each test toggles the target user's visibility via a dev-only HTTP
 * endpoint (`/api/_dev/set-visibility`, gated by ALLOW_DEV_MINT on the
 * Convex backend) and restores "public" afterward so adjacent specs are
 * not affected by test ordering.
 *
 * The "unauthenticated" branch is covered by the getByUsername unit
 * tests in convex/users.test.ts — the web route requires auth via
 * beforeLoad, so that code path can't be exercised through the browser.
 */

import {
	test as authTest,
	expect as authExpect,
} from "../fixtures/authenticated-web";
import { SEED_USERS } from "../fixtures/seed-ids";

const CONVEX_SITE_URL =
	process.env.VITE_CONVEX_SITE_URL || "https://glorious-toad-644.convex.site";

async function setVisibility(
	email: string,
	visibility: "public" | "friends" | "private"
): Promise<void> {
	const response = await fetch(`${CONVEX_SITE_URL}/api/_dev/set-visibility`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, visibility }),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(
			`/api/_dev/set-visibility failed for ${email}: ${response.status} ${text}\n` +
				"Is ALLOW_DEV_MINT=true set on the Convex backend?"
		);
	}
}

authTest.describe("profileVisibility enforcement", () => {
	authTest.afterEach(async () => {
		// Restore defaults so adjacent specs see a clean state. Best-effort —
		// individual tests can still fail if the endpoint is unreachable.
		await Promise.all([
			setVisibility(SEED_USERS.dan.email, "public").catch(() => {}),
			setVisibility(SEED_USERS.agucova.email, "public").catch(() => {}),
		]);
	});

	authTest(
		"private profile renders User-not-found for a non-owner viewer",
		async ({ authenticatedPage }) => {
			await setVisibility(SEED_USERS.dan.email, "private");

			const page = await authenticatedPage(SEED_USERS.agucova.email);
			await page.goto(`/u/${SEED_USERS.dan.username}`);
			await page.waitForLoadState("networkidle");

			await authExpect(page.getByText(/user not found/i)).toBeVisible({
				timeout: 10_000,
			});
			await authExpect(
				page.getByRole("heading", { name: SEED_USERS.dan.name, level: 1 })
			).toHaveCount(0);
		}
	);

	authTest(
		"friends-only profile renders User-not-found for a non-friend viewer",
		async ({ authenticatedPage }) => {
			// Dan isn't friends with Alice — only has a pending request to agucova.
			await setVisibility(SEED_USERS.dan.email, "friends");

			const page = await authenticatedPage(SEED_USERS.alice.email);
			await page.goto(`/u/${SEED_USERS.dan.username}`);
			await page.waitForLoadState("networkidle");

			await authExpect(page.getByText(/user not found/i)).toBeVisible({
				timeout: 10_000,
			});
		}
	);

	authTest(
		"private profile is still visible to its owner",
		async ({ authenticatedPage }) => {
			await setVisibility(SEED_USERS.agucova.email, "private");

			const page = await authenticatedPage(SEED_USERS.agucova.email);
			await page.goto(`/u/${SEED_USERS.agucova.username}`);
			await page.waitForLoadState("networkidle");

			await authExpect(
				page.getByRole("heading", {
					name: SEED_USERS.agucova.name,
					level: 1,
				})
			).toBeVisible({ timeout: 10_000 });
		}
	);
});
