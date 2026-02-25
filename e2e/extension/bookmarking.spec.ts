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
 * Wait for the bookmark section to finish loading.
 */
async function waitForBookmarkSection(
	popupPage: import("@playwright/test").Page
) {
	await popupPage.waitForFunction(
		() => !document.body.textContent?.includes("Checking..."),
		{ timeout: 10_000 }
	);
	// Extra wait for React renders to settle
	await popupPage.waitForTimeout(500);
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

		await page.goto("https://example.com");
		await page.waitForLoadState("domcontentloaded");

		// First open: bookmark the page
		let popupPage = await openPopup(context, extensionId);
		await waitForBookmarkSection(popupPage);

		// Ensure it's bookmarked
		const bookmarkButton = popupPage.getByRole("button", {
			name: "Bookmark",
		});
		if (await bookmarkButton.isVisible().catch(() => false)) {
			await bookmarkButton.click();
			await expect(
				popupPage.getByRole("button", { name: /bookmarked/i })
			).toBeVisible({ timeout: 10_000 });
		} else {
			// Already bookmarked — verify
			await expect(
				popupPage.getByRole("button", { name: /bookmarked/i })
			).toBeVisible({ timeout: 5_000 });
		}

		// Wait for the bookmark to be fully persisted
		await popupPage.waitForTimeout(2_000);
		await popupPage.close();

		// Re-inject the session cookie before reopening the popup.
		// Closing a popup tab can sometimes clear cookies in the extension
		// context. Re-injecting ensures the second popup is authenticated.
		const session = await authenticatedAs(SEED_USERS.agucova.id);

		// Ensure example.com page is active
		await page.bringToFront();
		await page.waitForTimeout(500);

		// Reopen the popup
		popupPage = await openPopup(context, extensionId);
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

		await page.goto("https://example.com");
		await page.waitForLoadState("domcontentloaded");

		const popupPage = await openPopup(context, extensionId);
		await waitForBookmarkSection(popupPage);

		// Bookmark if not already
		const bookmarkButton = popupPage.getByRole("button", {
			name: "Bookmark",
		});
		if (await bookmarkButton.isVisible().catch(() => false)) {
			await bookmarkButton.click();
			await expect(
				popupPage.getByRole("button", { name: /bookmarked/i })
			).toBeVisible({ timeout: 10_000 });
		}

		// Now click "Bookmarked" to unbookmark
		const bookmarkedButton = popupPage.getByRole("button", {
			name: /bookmarked/i,
		});
		await expect(bookmarkedButton).toBeVisible({ timeout: 5_000 });
		await bookmarkedButton.click();

		// The button should change back to "Bookmark" (unbookmarked state)
		await expect(
			popupPage.getByRole("button", { name: "Bookmark" })
		).toBeVisible({ timeout: 10_000 });

		await popupPage.close();
	});
});
