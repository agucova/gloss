import { db } from "@gloss/db";
import { bookmark } from "@gloss/db/schema";
import { eq } from "drizzle-orm";

import { expect, test } from "../fixtures/authenticated-extension";
import { SEED_USERS } from "../fixtures/seed-ids";

/**
 * Helper: open popup.html in a new page.
 *
 * The popup queries the active non-extension tab from its own context
 * and passes the tabId to the background script via GET_PAGE_METADATA.
 */
async function openPopup(
	context: import("@playwright/test").BrowserContext,
	extensionId: string
) {
	const popupPage = await context.newPage();
	await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
		waitUntil: "commit",
	});

	// Wait for popup to finish loading
	await popupPage.waitForFunction(
		() => !document.body.textContent?.includes("Loading..."),
		{ timeout: 15_000 }
	);

	return popupPage;
}

/**
 * Wait for the bookmark section to finish loading by positively
 * asserting that a bookmark button is rendered.
 */
async function waitForBookmarkSection(
	popupPage: import("@playwright/test").Page
) {
	await popupPage
		.getByRole("button", { name: /bookmark/i })
		.first()
		.waitFor({ state: "visible", timeout: 15_000 });
}

test.describe("Extension bookmarking", () => {
	test.setTimeout(45_000);

	test("popup shows bookmark UI for regular pages", async ({
		authenticatedAs,
		page,
		context,
		extensionId,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);

		await page.goto("https://example.com");
		await page.waitForLoadState("domcontentloaded");

		const popupPage = await openPopup(context, extensionId);

		const bookmarkButton = popupPage.getByRole("button", {
			name: /bookmark/i,
		});
		await expect(bookmarkButton).toBeVisible({ timeout: 10_000 });

		await popupPage.close();
	});

	test("clicking bookmark saves the page", async ({
		authenticatedAs,
		page,
		context,
		extensionId,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);

		await page.goto("https://example.com");
		await page.waitForLoadState("domcontentloaded");

		const popupPage = await openPopup(context, extensionId);
		await waitForBookmarkSection(popupPage);

		// Wait for any bookmark button to appear
		const anyBookmarkBtn = popupPage.getByRole("button", {
			name: /bookmark/i,
		});
		await expect(anyBookmarkBtn).toBeVisible({ timeout: 10_000 });

		// Check if the page is not yet bookmarked
		const bookmarkButton = popupPage.getByRole("button", {
			name: "Bookmark",
		});
		const isUnbookmarked = await bookmarkButton.isVisible().catch(() => false);

		if (isUnbookmarked) {
			await bookmarkButton.click();

			const bookmarkedButton = popupPage.getByRole("button", {
				name: /bookmarked/i,
			});
			await expect(bookmarkedButton).toBeVisible({ timeout: 10_000 });
		} else {
			// Already bookmarked
			const bookmarkedButton = popupPage.getByRole("button", {
				name: /bookmarked/i,
			});
			await expect(bookmarkedButton).toBeVisible({ timeout: 5_000 });
		}

		await popupPage.close();
	});

	test("bookmarked state persists after reopening popup", async ({
		authenticatedAs,
		page,
		context,
		extensionId,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);

		// Use a unique URL to avoid collisions with other bookmarking tests
		// running in parallel (they all share the same DB and user).
		const uniqueUrl = `https://example.com/persist-test-${Date.now()}`;
		await page.route(uniqueUrl, (route) =>
			route.fulfill({
				contentType: "text/html",
				body: "<html><head><title>Persist Test</title></head><body><h1>Persist Test</h1></body></html>",
			})
		);
		await page.goto(uniqueUrl);
		await page.waitForLoadState("domcontentloaded");

		const popupPage = await openPopup(context, extensionId);
		await waitForBookmarkSection(popupPage);

		// Should be unbookmarked (unique URL, never bookmarked before)
		const bookmarkButton = popupPage.getByRole("button", {
			name: "Bookmark",
		});
		await expect(bookmarkButton).toBeVisible({ timeout: 5_000 });

		// Click to bookmark
		await bookmarkButton.click();
		await expect(
			popupPage.getByRole("button", { name: /bookmarked/i })
		).toBeVisible({ timeout: 10_000 });

		// Wait for the save to complete
		await popupPage.waitForTimeout(1_000);

		// Navigate the popup away and back to force a fresh data load
		await popupPage.goto("about:blank");
		await popupPage.waitForTimeout(500);

		await page.bringToFront();
		await popupPage.waitForTimeout(500);
		await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
			waitUntil: "commit",
		});
		await popupPage.waitForFunction(
			() => !document.body.textContent?.includes("Loading..."),
			{ timeout: 15_000 }
		);
		await waitForBookmarkSection(popupPage);

		// The "Bookmarked" button should still be visible (state persisted)
		const bookmarkedButton = popupPage.getByRole("button", {
			name: /bookmarked/i,
		});
		await expect(bookmarkedButton).toBeVisible({ timeout: 10_000 });

		await popupPage.close();
	});

	test("can unbookmark a page", async ({
		authenticatedAs,
		page,
		context,
		extensionId,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);

		// Use a unique URL to avoid collisions with parallel tests
		const uniqueUrl = `https://example.com/unbookmark-test-${Date.now()}`;
		await page.route(uniqueUrl, (route) =>
			route.fulfill({
				contentType: "text/html",
				body: "<html><head><title>Unbookmark Test</title></head><body><h1>Unbookmark Test</h1></body></html>",
			})
		);
		await page.goto(uniqueUrl);
		await page.waitForLoadState("domcontentloaded");

		const popupPage = await openPopup(context, extensionId);
		await waitForBookmarkSection(popupPage);

		// Bookmark the page first
		const bookmarkButton = popupPage.getByRole("button", {
			name: "Bookmark",
		});
		await expect(bookmarkButton).toBeVisible({ timeout: 5_000 });
		await bookmarkButton.click();
		await expect(
			popupPage.getByRole("button", { name: /bookmarked/i })
		).toBeVisible({ timeout: 10_000 });

		// Now click "Bookmarked" to unbookmark
		const bookmarkedButton = popupPage.getByRole("button", {
			name: /bookmarked/i,
		});
		await bookmarkedButton.click();

		// The button should change back to "Bookmark" (unbookmarked state)
		await expect(
			popupPage.getByRole("button", { name: "Bookmark" })
		).toBeVisible({ timeout: 10_000 });

		await popupPage.close();
	});
});
