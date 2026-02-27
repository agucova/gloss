/**
 * Playwright global setup: verifies Convex dev deployment has seed data.
 *
 * If the seed data is missing, the test suite aborts early with a clear
 * message rather than producing confusing auth failures.
 */

import { ConvexHttpClient } from "convex/browser";

import { SEED_USERS } from "./fixtures/seed-ids";

const CONVEX_URL =
	process.env.VITE_CONVEX_URL || "https://glorious-toad-644.convex.cloud";

async function globalSetup() {
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
