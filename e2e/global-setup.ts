/**
 * Playwright global setup: verifies Convex dev deployment has seed data, and
 * ensures the CLI package is built (dist/cli.js + dist/mcp.js exist) before
 * e2e/cli specs spawn it as a subprocess.
 */

import { ConvexHttpClient } from "convex/browser";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { SEED_USERS } from "./fixtures/seed-ids";

const CONVEX_URL =
	process.env.VITE_CONVEX_URL || "https://glorious-toad-644.convex.cloud";

function ensureCliBuilt() {
	const repoRoot = resolve(__dirname, "..");
	const cliDist = resolve(repoRoot, "packages/cli/dist/cli.js");
	const mcpDist = resolve(repoRoot, "packages/cli/dist/mcp.js");

	if (existsSync(cliDist) && existsSync(mcpDist)) return;

	console.log("[global-setup] Building @gloss-space/cli…");
	execSync("bun run build", {
		cwd: resolve(repoRoot, "packages/cli"),
		stdio: "inherit",
	});
}

async function globalSetup() {
	ensureCliBuilt();
	const client = new ConvexHttpClient(CONVEX_URL);

	try {
		// Try to query for the seed user via the users.checkUsername query
		const { api } = await import("../convex/_generated/api");
		const result = await client.query(api.users.checkUsername, {
			username: SEED_USERS.agucova.username,
		});

		if (result.available) {
			throw new Error(
				"Seed data not found. Run `bun run convex:seed` before E2E tests.\n" +
					"(Make sure `bunx convex dev` is running first.)"
			);
		}
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("Seed data not found")
		) {
			throw error;
		}
		// If the query itself fails, the Convex deployment might not be running
		throw new Error(
			`Cannot connect to Convex deployment at ${CONVEX_URL}.\n` +
				"Make sure `bunx convex dev` is running.\n" +
				`Original error: ${error instanceof Error ? error.message : error}`
		);
	}
}

export default globalSetup;
