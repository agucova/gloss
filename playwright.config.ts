import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for the Gloss monorepo.
 *
 * With Convex, the API server is hosted by Convex (no local server needed).
 * Only the Vite dev server needs to run locally for the web app.
 * The Convex dev server (bunx convex dev) should be running separately.
 */
export default defineConfig({
	testDir: "e2e",

	globalSetup: "./e2e/global-setup.ts",

	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? "github" : "html",

	use: {
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},

	projects: [
		{
			name: "extension",
			testDir: "e2e/extension",
			use: {
				...devices["Desktop Chrome"],
			},
		},
		{
			name: "web",
			testDir: "e2e/web",
			use: {
				...devices["Desktop Chrome"],
				baseURL: "http://localhost:3001",
			},
		},
	],

	// Only the web dev server needs to run locally.
	// Convex dev server should be started separately (bunx convex dev).
	webServer: [
		{
			command: "bun run dev:web",
			port: 3001,
			reuseExistingServer: !process.env.CI,
			cwd: ".",
			timeout: 30_000,
		},
	],
});
