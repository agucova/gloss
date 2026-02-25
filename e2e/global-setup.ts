/**
 * Playwright global setup: verifies seed data exists before running E2E tests.
 *
 * If the seed user is missing, the test suite aborts early with a clear
 * message rather than producing confusing auth failures later.
 */

import { db } from "@gloss/db";
import { user } from "@gloss/db/schema";
import { eq } from "drizzle-orm";

import { SEED_USERS } from "./fixtures/seed-ids";

async function globalSetup() {
	const seedUser = await db.query.user.findFirst({
		where: eq(user.id, SEED_USERS.agucova.id),
	});

	if (!seedUser) {
		throw new Error(
			"Seed data not found. Run `bun run db:seed` before E2E tests."
		);
	}
}

export default globalSetup;
