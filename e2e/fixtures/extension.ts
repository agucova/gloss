import { type BrowserContext, test as base, chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the built Chrome MV3 extension
const EXTENSION_PATH = path.resolve(
	__dirname,
	"../../apps/extension/.output/chrome-mv3"
);

/**
 * Custom Playwright fixture that launches a persistent Chromium context
 * with the Gloss extension side-loaded. This is the standard approach
 * for testing Chrome extensions with Playwright.
 *
 * Provides:
 * - `context`: A BrowserContext with the extension loaded
 * - `extensionId`: The dynamically resolved extension ID
 *
 * Usage in tests:
 *   import { test, expect } from "../fixtures/extension";
 *   test("popup loads", async ({ page, extensionId }) => { ... });
 */
export const test = base.extend<{
	context: BrowserContext;
	extensionId: string;
}>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixture convention
	context: async ({}, use) => {
		const context = await chromium.launchPersistentContext("", {
			headless: false,
			channel: "chromium",
			args: [
				"--headless=new",
				`--disable-extensions-except=${EXTENSION_PATH}`,
				`--load-extension=${EXTENSION_PATH}`,
				"--disable-default-apps",
				"--no-first-run",
			],
		});
		await use(context);
		await context.close();
	},

	extensionId: async ({ context }, use) => {
		// For MV3 extensions, we get the extension ID from the service worker URL.
		// The service worker URL looks like: chrome-extension://<id>/background.js
		let [serviceWorker] = context.serviceWorkers();
		if (!serviceWorker) {
			// The service worker may not have started yet -- wait for it.
			// This is a known race condition with MV3 extensions in Playwright.
			serviceWorker = await context.waitForEvent("serviceworker", {
				timeout: 10_000,
			});
		}

		const extensionId = serviceWorker.url().split("/")[2];
		await use(extensionId);
	},
});

export const expect = test.expect;
