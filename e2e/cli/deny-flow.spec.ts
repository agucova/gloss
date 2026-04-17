import { expect, test } from "@playwright/test";

import { createTestSession, injectSessionCookies } from "../fixtures/auth";
import { createTmpConfigDir, readConfigFrom, spawnCli } from "../fixtures/cli";
import { SEED_USERS } from "../fixtures/seed-ids";

test.describe("CLI OAuth deny", () => {
	test("deny on the consent screen exits the CLI with an error and leaves the config untouched", async ({
		browser,
	}) => {
		const configDir = createTmpConfigDir();

		const cli = spawnCli(["auth", "login"], { configDir });
		const match = await cli.waitForStdout(/visit:\s*(https?:\/\/\S+)/, 30_000);
		const authorizeUrl = match[1];

		const session = await createTestSession(SEED_USERS.agucova.email);
		const context = await browser.newContext();
		await injectSessionCookies(context, session);
		const page = await context.newPage();

		await page.goto(authorizeUrl);
		await expect(
			page.getByRole("heading", {
				name: /Grant the Gloss CLI read access/,
			})
		).toBeVisible();

		await page.getByRole("button", { name: "Deny" }).click();

		const exitCode = await cli.waitForExit(15_000);
		expect(exitCode).not.toBe(0);
		expect(cli.stderr() + cli.stdout()).toMatch(/access_denied|denied/i);

		const config = readConfigFrom(configDir);
		expect(config.apiKey).toBeUndefined();

		await context.close();
	});
});
