import { expect, test } from "@playwright/test";

import { createTestSession, injectSessionCookies } from "../fixtures/auth";
import { createTmpConfigDir, readConfigFrom, spawnCli } from "../fixtures/cli";
import { SEED_USERS } from "../fixtures/seed-ids";

test.describe("CLI OAuth + PKCE login", () => {
	test("round-trips from gloss auth login → consent approve → key on disk", async ({
		browser,
	}) => {
		const configDir = createTmpConfigDir();

		// Start the CLI — it generates PKCE, spins up a loopback server, opens
		// the browser (which we ignore) and prints the authorize URL to stdout.
		const cli = spawnCli(["auth", "login"], { configDir });

		const match = await cli.waitForStdout(/visit:\s*(https?:\/\/\S+)/, 30_000);
		const authorizeUrl = match[1];
		expect(authorizeUrl).toContain("/api/auth/cli/authorize");

		// Seed a Better-Auth session for the test user and inject it into a
		// fresh browser context, then navigate to the authorize URL. Convex
		// 302s us to the web consent screen; Better-Auth accepts the cookies
		// cross-domain and we land signed in.
		const session = await createTestSession(SEED_USERS.agucova.email);
		const context = await browser.newContext();
		await injectSessionCookies(context, session);
		const page = await context.newPage();

		await page.goto(authorizeUrl);
		await expect(
			page.getByRole("heading", {
				name: /Grant the Gloss CLI read access/,
			})
		).toBeVisible({ timeout: 10_000 });

		// Approve → browser navigates to 127.0.0.1:<port>/callback, the CLI's
		// loopback server exchanges the code for an API key and exits 0.
		await page.getByRole("button", { name: "Approve" }).click();

		const exitCode = await cli.waitForExit(15_000);
		expect(exitCode).toBe(0);

		const config = readConfigFrom(configDir);
		expect(config.apiKey).toMatch(/^gloss_sk_[0-9a-f]{32}$/);

		await context.close();
	});
});
