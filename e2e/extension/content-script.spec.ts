import { expect, test } from "../fixtures/extension";

test.describe("Extension content script", () => {
	test("content script initializes on a webpage", async ({ page }) => {
		// Navigate to a simple page where the content script should inject
		await page.goto("https://example.com");
		await page.waitForLoadState("domcontentloaded");

		// The content script logs "[Gloss] Content script initialized" to console.
		// We can verify the content script loaded by checking for it.
		// Give the content script time to initialize (it runs at document_idle).
		const consoleMessages: string[] = [];
		page.on("console", (msg) => {
			consoleMessages.push(msg.text());
		});

		// Wait a moment for the content script to initialize
		await page.waitForTimeout(2_000);

		// Navigate again to catch console messages from a fresh load
		await page.goto("https://example.com");
		await page.waitForLoadState("domcontentloaded");

		// Wait for the content script to initialize
		await page.waitForTimeout(3_000);

		// The content script should have logged its initialization message
		const hasInitMessage = consoleMessages.some((msg) =>
			msg.includes("[Gloss] Content script initialized")
		);
		expect(hasInitMessage).toBe(true);
	});

	test("content script does not inject on chrome:// pages", async ({
		page,
	}) => {
		// Navigate to chrome://version (an internal page)
		await page.goto("chrome://version");
		await page.waitForLoadState("domcontentloaded");

		const consoleMessages: string[] = [];
		page.on("console", (msg) => {
			consoleMessages.push(msg.text());
		});

		await page.waitForTimeout(2_000);

		// Content script should NOT initialize on chrome:// pages
		const hasInitMessage = consoleMessages.some((msg) =>
			msg.includes("[Gloss] Content script initialized")
		);
		expect(hasInitMessage).toBe(false);
	});
});
