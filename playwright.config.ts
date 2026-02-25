import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for the Gloss monorepo.
 *
 * Two test projects are configured:
 * - "extension": Tests the Chrome extension (popup, newtab, content scripts)
 *   using a persistent browser context with the extension loaded.
 * - "web": Tests the web app (login, dashboard, profiles) as a standard
 *   Playwright browser test against the Vite dev server.
 *
 * Run all tests:      bunx playwright test
 * Run extension only: bunx playwright test --project=extension
 * Run web only:       bunx playwright test --project=web
 */
export default defineConfig({
	testDir: "e2e",

	// Verify seed data exists before running any tests
	globalSetup: "./e2e/global-setup.ts",

	// Fail CI if test.only was accidentally left in
	forbidOnly: !!process.env.CI,

	// Retry failed tests in CI to handle flakiness (especially extension service worker races)
	retries: process.env.CI ? 2 : 0,

	// Run tests sequentially in CI to reduce flakiness; use parallelism locally
	workers: process.env.CI ? 1 : undefined,

	reporter: process.env.CI ? "github" : "html",

	use: {
		// Collect traces on first retry for debugging failures
		trace: "on-first-retry",
		// Screenshot on failure for visual debugging
		screenshot: "only-on-failure",
	},

	projects: [
		{
			name: "extension",
			testDir: "e2e/extension",
			// Extension tests use custom fixtures that launch a persistent context
			// with the extension loaded. See e2e/fixtures/extension.ts.
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

	// Start dev servers before running tests.
	// Both web and API servers are needed: the extension and web app
	// both make authenticated requests to the API server.
	webServer: [
		{
			command: "bun run dev:server",
			port: 3000,
			reuseExistingServer: !process.env.CI,
			cwd: ".",
			timeout: 30_000,
		},
		{
			command: "bun run dev:web",
			port: 3001,
			reuseExistingServer: !process.env.CI,
			cwd: ".",
			timeout: 30_000,
		},
	],
});
