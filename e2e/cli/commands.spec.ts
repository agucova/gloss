import { expect, test } from "@playwright/test";

import { createTmpConfigDir, mintTestApiKey, spawnCli } from "../fixtures/cli";
import { SEED_USERS } from "../fixtures/seed-ids";

// Mint once per describe — the CLI commands below all just read with it.
let apiKey: string;

test.beforeAll(() => {
	apiKey = mintTestApiKey(SEED_USERS.agucova.email);
});

async function runCli(args: string[]) {
	const configDir = createTmpConfigDir();
	const cli = spawnCli(args, { apiKey, configDir });
	const code = await cli.waitForExit(20_000);
	return { code, stdout: cli.stdout(), stderr: cli.stderr() };
}

test.describe("CLI commands (read-only, API key auth)", () => {
	test("whoami returns the seed user's profile", async () => {
		// whoami has no --format flag; parse the human-readable output.
		const { code, stdout } = await runCli(["auth", "whoami"]);
		expect(code).toBe(0);
		expect(stdout).toContain(SEED_USERS.agucova.email);
		expect(stdout).toContain(SEED_USERS.agucova.name);
	});

	test("search returns results with the expected shape", async () => {
		const { code, stdout } = await runCli([
			"search",
			"the",
			"--format",
			"json",
			"--limit",
			"5",
		]);
		expect(code).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.results).toBeInstanceOf(Array);
		expect(parsed.meta.query).toBe("the");
		for (const row of parsed.results) {
			expect(row.id).toBeTruthy();
			expect(["highlight", "bookmark", "comment"]).toContain(row.type);
			expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		}
	});

	test("highlights returns the caller's items", async () => {
		const { code, stdout } = await runCli([
			"highlights",
			"--format",
			"json",
			"--limit",
			"5",
		]);
		expect(code).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.items).toBeInstanceOf(Array);
		if (parsed.items.length > 0) {
			for (const h of parsed.items) {
				expect(h.id).toBeTruthy();
				expect(h.text).toBeTruthy();
				expect(["private", "friends", "public"]).toContain(h.visibility);
			}
		}
	});

	test("bookmarks returns the caller's items", async () => {
		const { code, stdout } = await runCli([
			"bookmarks",
			"--format",
			"json",
			"--limit",
			"5",
		]);
		expect(code).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.items).toBeInstanceOf(Array);
		if (parsed.items.length > 0) {
			for (const b of parsed.items) {
				expect(b.id).toBeTruthy();
				expect(b.url).toBeTruthy();
			}
		}
	});

	test("tags returns the caller's tags", async () => {
		const { code, stdout } = await runCli(["tags", "--format", "json"]);
		expect(code).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.tags).toBeInstanceOf(Array);
		for (const t of parsed.tags) {
			expect(t.id).toBeTruthy();
			expect(t.name).toBeTruthy();
		}
	});

	test("invalid API key exits nonzero with a clear error", async () => {
		const configDir = createTmpConfigDir();
		const cli = spawnCli(["highlights", "--format", "json"], {
			apiKey: "gloss_sk_not_a_real_key",
			configDir,
		});
		const code = await cli.waitForExit(15_000);
		expect(code).not.toBe(0);
		expect(cli.stderr() + cli.stdout()).toMatch(
			/Authentication required|401|Not authenticated/i
		);
	});
});
