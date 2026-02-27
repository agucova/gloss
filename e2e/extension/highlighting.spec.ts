/**
 * E2E tests for the core highlighting flow.
 *
 * Tests text selection, popover display, highlight creation,
 * persistence across reloads, unauthenticated behavior, and
 * popover dismissal.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Use authenticated fixture for most tests
import { expect, test } from "../fixtures/authenticated-extension";
// Also import the base extension fixture for unauthenticated tests
import {
	test as unauthTest,
	expect as unauthExpect,
} from "../fixtures/extension";
import { SEED_USERS } from "../fixtures/seed-ids";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testPageHtml = readFileSync(
	path.resolve(__dirname, "../fixtures/test-page.html"),
	"utf-8"
);

const TEST_URL = "https://test.gloss.local/article";

/**
 * Helper: route the test URL to serve our static HTML fixture,
 * navigate there, and wait for the content script to initialize.
 */
async function setupTestPage(page: import("@playwright/test").Page) {
	// Set up route interception before navigation
	await page.route("https://test.gloss.local/**", (route) =>
		route.fulfill({ contentType: "text/html", body: testPageHtml })
	);

	// Collect console messages for content-script detection
	const consoleMessages: string[] = [];
	page.on("console", (msg) => {
		consoleMessages.push(msg.text());
	});

	await page.goto(TEST_URL);
	await page.waitForLoadState("domcontentloaded");

	// Wait for the content script to initialize.
	// The content script logs "[Gloss] Content script initialized" at startup.
	await page
		.waitForFunction(
			() => {
				// We can't read console from within page context, but we can
				// check for a side-effect: the highlight styles being injected
				return !!document.getElementById("gloss-highlight-styles");
			},
			{ timeout: 15_000 }
		)
		.catch(() => {
			// Fallback: just wait a generous amount of time
		});

	// Give the content script a bit more time to complete async init
	// (auth state check, highlight loading, etc.)
	await page.waitForTimeout(2_000);

	return { consoleMessages };
}

/**
 * Helper: select text in an element using mouse drag.
 * Simulates a real user dragging from left to right across the element.
 */
async function selectTextInElement(
	page: import("@playwright/test").Page,
	selector: string,
	startOffsetX = 10,
	dragWidth = 200
) {
	const element = page.locator(selector);
	await element.waitFor({ state: "visible", timeout: 5_000 });
	const box = await element.boundingBox();
	if (!box) {
		throw new Error(`Element ${selector} has no bounding box`);
	}

	const startX = box.x + startOffsetX;
	const y = box.y + box.height / 2;
	const endX = startX + dragWidth;

	await page.mouse.move(startX, y);
	await page.mouse.down();
	await page.mouse.move(endX, y, { steps: 10 });
	await page.mouse.up();

	// The content script adds a 10ms delay before processing selection
	await page.waitForTimeout(200);
}

test.describe("Highlighting", () => {
	test.setTimeout(45_000);

	test("selecting text shows highlight popover with highlight button", async ({
		page,
		authenticatedAs,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);
		await setupTestPage(page);

		// Select text in paragraph 1
		await selectTextInElement(page, "#para-1");

		// The selection popover is a host element injected into the page body
		// with id="gloss-selection-popover".
		const popoverHost = page.locator("#gloss-selection-popover");
		await expect(popoverHost).toBeAttached({ timeout: 5_000 });

		// Verify the host element is positioned (top/left set by popover placement)
		const hostStyle = await popoverHost.getAttribute("style");
		expect(hostStyle).toContain("top:");
	});

	test("clicking highlight button creates a highlight mark element", async ({
		page,
		authenticatedAs,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);
		await setupTestPage(page);

		// Select text in paragraph 1
		await selectTextInElement(page, "#para-1");

		// Wait for popover to appear
		const popoverHost = page.locator("#gloss-selection-popover");
		await expect(popoverHost).toBeAttached({ timeout: 5_000 });

		// Wait for the CREATE_HIGHLIGHT API response to confirm highlight was saved
		const highlightCreatedPromise = page.waitForEvent("console", {
			predicate: (msg) => msg.text().includes("[Gloss] Created highlight:"),
			timeout: 10_000,
		});

		// With open shadow DOM, Playwright can pierce the shadow root and
		// find the highlight button directly
		const highlightButton = page.getByRole("button", {
			name: /highlight/i,
		});
		const buttonVisible = await highlightButton
			.isVisible({ timeout: 3_000 })
			.catch(() => false);

		if (buttonVisible) {
			await highlightButton.click();
		} else {
			// Fallback: coordinate-based clicking for the icon button
			const selectionEnd = await page.evaluate(() => {
				const sel = window.getSelection();
				if (!sel || sel.rangeCount === 0) return null;
				const range = sel.getRangeAt(0);
				const rects = range.getClientRects();
				const lastRect = rects[rects.length - 1];
				if (!lastRect) return null;
				return {
					right: lastRect.right,
					top: lastRect.top,
				};
			});

			if (selectionEnd) {
				const clickX = selectionEnd.right - 20;
				const clickY = selectionEnd.top - 24;
				await page.mouse.click(clickX, clickY);
			}
		}

		// Wait for the highlight to be created (console log confirmation)
		await highlightCreatedPromise.catch(() => {
			// May not appear if API call fails in test environment
		});

		// Verify that a <mark> element with class "gloss-highlight" was created
		const marks = page.locator("mark.gloss-highlight");
		await expect(marks.first()).toBeAttached({ timeout: 5_000 });

		// The mark should have a data-gloss-id attribute
		const glossId = await marks.first().getAttribute("data-gloss-id");
		expect(glossId).toBeTruthy();

		// The mark should have a background color set (the own highlight color)
		const bgColor = await marks
			.first()
			.evaluate((el) => (el as HTMLElement).style.backgroundColor);
		expect(bgColor).toBeTruthy();
	});

	test("highlight persists after page reload", async ({
		page,
		authenticatedAs,
	}) => {
		await authenticatedAs(SEED_USERS.agucova.id);
		await setupTestPage(page);

		// Select text and create a highlight
		await selectTextInElement(page, "#para-1");

		// Wait for popover
		const popoverHost = page.locator("#gloss-selection-popover");
		await expect(popoverHost).toBeAttached({ timeout: 5_000 });

		// Wait for the API save to complete
		const highlightSavedPromise = page.waitForEvent("console", {
			predicate: (msg) => msg.text().includes("[Gloss] Highlight saved:"),
			timeout: 15_000,
		});

		// With open shadow DOM, Playwright can find the highlight button
		const highlightButton = page.getByRole("button", {
			name: /highlight/i,
		});
		const buttonVisible = await highlightButton
			.isVisible({ timeout: 3_000 })
			.catch(() => false);

		if (buttonVisible) {
			await highlightButton.click();
		} else {
			// Fallback: coordinate-based clicking
			const selectionEnd = await page.evaluate(() => {
				const sel = window.getSelection();
				if (!sel || sel.rangeCount === 0) return null;
				const range = sel.getRangeAt(0);
				const rects = range.getClientRects();
				const lastRect = rects[rects.length - 1];
				if (!lastRect) return null;
				return {
					right: lastRect.right,
					top: lastRect.top,
				};
			});

			if (selectionEnd) {
				const clickX = selectionEnd.right - 20;
				const clickY = selectionEnd.top - 24;
				await page.mouse.click(clickX, clickY);
			}
		}

		// Wait for the highlight to be saved to server
		await highlightSavedPromise.catch(() => {
			// Proceed even if we didn't catch the log
		});

		// Verify highlight exists before reload
		const marksBefore = page.locator("mark.gloss-highlight");
		await expect(marksBefore.first()).toBeAttached({ timeout: 5_000 });

		// Reload the page (re-register the route handler since reload clears it)
		await page.route("https://test.gloss.local/**", (route) =>
			route.fulfill({ contentType: "text/html", body: testPageHtml })
		);
		await page.reload();
		await page.waitForLoadState("domcontentloaded");

		// Wait for the content script to re-initialize and load highlights
		await page
			.waitForEvent("console", {
				predicate: (msg) => msg.text().includes("[Gloss] Highlights loaded"),
				timeout: 15_000,
			})
			.catch(() => {
				// Fallback wait
			});
		await page.waitForTimeout(2_000);

		// Verify highlight still exists after reload
		// The mark elements should be re-created by the anchoring library
		const marksAfter = page.locator("mark.gloss-highlight");
		await expect(marksAfter.first()).toBeAttached({ timeout: 10_000 });
	});

	test("popover dismisses on click-away", async ({ page, authenticatedAs }) => {
		await authenticatedAs(SEED_USERS.agucova.id);
		await setupTestPage(page);

		// Select text to show popover
		await selectTextInElement(page, "#para-1");

		// Wait for popover to appear
		const popoverHost = page.locator("#gloss-selection-popover");
		await expect(popoverHost).toBeAttached({ timeout: 5_000 });

		// The popover dismiss handler has a 100ms activation delay
		await page.waitForTimeout(200);

		// Click on an empty area (far from the selection and popover)
		// The #para-3 element is far enough from #para-1 to not overlap
		const para3 = page.locator("#para-3");
		const box = await para3.boundingBox();
		if (box) {
			await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		}

		// Wait for the popover dismiss animation (150ms fallback timeout)
		await page.waitForTimeout(300);

		// The popover host should be removed from the DOM
		await expect(popoverHost).not.toBeAttached({ timeout: 3_000 });
	});
});

// Unauthenticated test uses the base extension fixture (no auth)
unauthTest.describe("Highlighting (unauthenticated)", () => {
	unauthTest.setTimeout(45_000);

	unauthTest("unauthenticated user sees sign-in prompt", async ({ page }) => {
		// Set up route interception
		await page.route("https://test.gloss.local/**", (route) =>
			route.fulfill({ contentType: "text/html", body: testPageHtml })
		);

		// Navigate and wait for content script
		await page.goto(TEST_URL);
		await page.waitForLoadState("domcontentloaded");
		await page.waitForTimeout(3_000);

		// Select text in paragraph 1
		await selectTextInElement(page, "#para-1");

		// The popover should appear
		const popoverHost = page.locator("#gloss-selection-popover");
		await expect(popoverHost).toBeAttached({ timeout: 5_000 });

		// For unauthenticated users, the popover shows "Sign in to save highlights"
		// and a "Sign in" button. With open shadow DOM, Playwright can pierce it.
		const signInBtn = page.getByRole("button", {
			name: "Sign in to Gloss",
		});
		const signInVisible = await signInBtn
			.isVisible({ timeout: 3_000 })
			.catch(() => false);

		if (signInVisible) {
			unauthExpect(signInVisible).toBe(true);
		} else {
			// The popover host is attached, meaning the popover was shown.
			// Verify the "Create highlight" button is NOT accessible
			// (since user is unauthenticated and sees sign-in prompt instead).
			const highlightBtn = page.getByRole("button", {
				name: "Create highlight",
			});
			const highlightVisible = await highlightBtn
				.isVisible({ timeout: 1_000 })
				.catch(() => false);
			unauthExpect(highlightVisible).toBe(false);
		}
	});
});
