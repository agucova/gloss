/**
 * End-to-end tests for the Curius API client against the live API.
 *
 * Requires a valid Curius JWT token. Provide it via:
 *   CURIUS_TOKEN=<token> bun test packages/curius/src/client-e2e.test.ts
 *
 * These tests exercise read operations and a full write→read→cleanup cycle
 * for both links and highlights. Skipped when no token is set.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { CuriusLink, CuriusUser } from "./types";

import { CuriusClient } from "./client";
import { CuriusAuthError } from "./errors";

const token = process.env.CURIUS_TOKEN;

// Unique URL per test run to avoid collisions
const TEST_URL = `https://example.com/gloss-e2e-${Date.now()}`;
const TEST_HIGHLIGHT = {
	rawHighlight: "This domain is for use in illustrative examples",
	leftContext: "",
	rightContext: " in documents.",
};

describe.skipIf(!token)("Curius E2E (live API)", () => {
	let client: CuriusClient;
	let currentUser: CuriusUser;

	// Track created resources for cleanup
	let createdLinkId: string | undefined;

	beforeAll(() => {
		client = new CuriusClient({ token: token!, timeout: 30_000 });
	});

	afterAll(async () => {
		if (createdLinkId) {
			try {
				await client.deleteLink(createdLinkId);
			} catch {
				// Ignore — test may have already cleaned it up
			}
		}
	});

	// =========================================================================
	// 1. Authentication
	// =========================================================================

	describe("authentication", () => {
		test("verifyToken returns true for a valid token", async () => {
			const valid = await client.verifyToken();
			expect(valid).toBe(true);
		});

		test("verifyToken returns false for a malformed token", async () => {
			const bad = new CuriusClient({
				token: "not-a-real-token",
				timeout: 10_000,
			});
			const valid = await bad.verifyToken();
			expect(valid).toBe(false);
		});

		test("getUser fails gracefully with invalid token", async () => {
			const bad = new CuriusClient({
				token: "not-a-real-token",
				timeout: 10_000,
			});
			try {
				await bad.getUser();
				expect.unreachable("Should have thrown");
			} catch (error) {
				expect(
					error instanceof CuriusAuthError ||
						(error instanceof Error &&
							error.message.toLowerCase().includes("token"))
				).toBe(true);
			}
		});
	});

	// =========================================================================
	// 2. User profile
	// =========================================================================

	describe("user profile", () => {
		test("getUser returns a valid user with required fields", async () => {
			currentUser = await client.getUser();

			expect(currentUser.id).toBeDefined();
			expect(typeof currentUser.firstName).toBe("string");
			expect(typeof currentUser.lastName).toBe("string");
			expect(typeof currentUser.userLink).toBe("string");
			expect(currentUser.firstName.length).toBeGreaterThan(0);
			expect(currentUser.userLink.length).toBeGreaterThan(0);
		});
	});

	// =========================================================================
	// 3. Social graph
	// =========================================================================

	describe("following", () => {
		test("getFollowing returns an array of users", async () => {
			const following = await client.getFollowing();

			expect(Array.isArray(following)).toBe(true);
			expect(following.length).toBeGreaterThan(0);

			const first = following[0]!;
			expect(first.id).toBeDefined();
			expect(typeof first.firstName).toBe("string");
			expect(typeof first.userLink).toBe("string");
		});
	});

	// =========================================================================
	// 4. Links — reading user's saved links
	// =========================================================================

	describe("links (read)", () => {
		test("getUserLinks returns an array of links via /api/users/:id/links", async () => {
			const links = await client.getUserLinks();

			expect(Array.isArray(links)).toBe(true);
			expect(links.length).toBeGreaterThan(0);

			const first = links[0]!;
			expect(first.id).toBeDefined();
			expect(first.link).toBeDefined();
			expect(Array.isArray(first.highlights)).toBe(true);
		});

		test("getLinkByUrl returns a link for a saved URL", async () => {
			const links = await client.getUserLinks();
			const savedUrl = links[0]!.link!;

			const link = await client.getLinkByUrl(savedUrl);

			expect(link).not.toBeNull();
			expect(link!.id).toBeDefined();
		});

		test("getLinkByUrl returns null for an unsaved URL", async () => {
			const link = await client.getLinkByUrl(
				"https://example.com/this-url-does-not-exist-in-curius-ever"
			);
			expect(link).toBeNull();
		});
	});

	// =========================================================================
	// 5. Network info
	// =========================================================================

	describe("network", () => {
		test("getNetworkInfo returns data for a popular URL", async () => {
			const info = await client.getNetworkInfo(
				"https://paulgraham.com/greatwork.html"
			);

			expect(info).not.toBeNull();
			expect(info!.id).toBeDefined();
			expect(typeof info!.link).toBe("string");
			expect(Array.isArray(info!.users)).toBe(true);
			expect(Array.isArray(info!.highlights)).toBe(true);
			expect(info!.users.length).toBeGreaterThan(0);
		});

		test("getNetworkInfo returns null for an unknown URL", async () => {
			const info = await client.getNetworkInfo(
				"https://example.com/nobody-saved-this-url-on-curius"
			);
			expect(info).toBeNull();
		});
	});

	// =========================================================================
	// 6. Full link + highlight lifecycle
	// =========================================================================

	describe("link + highlight lifecycle", () => {
		let testLink: CuriusLink;

		test("addLink creates a new link", async () => {
			testLink = await client.addLink({
				url: TEST_URL,
				title: "Gloss E2E Test Page",
				snippet: "A test page created by the Gloss E2E suite.",
			});
			createdLinkId = testLink.id;

			expect(testLink.id).toBeDefined();
			expect(testLink.highlights).toHaveLength(0);
		});

		test("getLinkByUrl finds the newly created link", async () => {
			const found = await client.getLinkByUrl(TEST_URL);

			expect(found).not.toBeNull();
			expect(found!.id).toBe(testLink.id);
		});

		test("addHighlight attaches a highlight to the link", async () => {
			await client.addHighlight(testLink.id, TEST_HIGHLIGHT);

			// Verify it shows up
			const links = await client.getUserLinks();
			const match = links.find((l) => l.id === testLink.id);
			expect(match).toBeDefined();

			const hlTexts = match!.highlights.map(
				(h) => h.highlight ?? h.rawHighlight ?? h.highlightText
			);
			expect(hlTexts).toContain(TEST_HIGHLIGHT.rawHighlight);
		});

		test("deleteHighlight removes the highlight", async () => {
			await client.deleteHighlight(testLink.id, TEST_HIGHLIGHT.rawHighlight);

			const links = await client.getUserLinks();
			const match = links.find((l) => l.id === testLink.id);
			expect(match).toBeDefined();

			const hlTexts = match!.highlights.map(
				(h) => h.highlight ?? h.rawHighlight ?? h.highlightText
			);
			expect(hlTexts).not.toContain(TEST_HIGHLIGHT.rawHighlight);
		});

		test("deleteLink removes the test link", async () => {
			await client.deleteLink(testLink.id);
			createdLinkId = undefined;

			const found = await client.getLinkByUrl(TEST_URL);
			expect(found).toBeNull();
		});
	});

	// =========================================================================
	// 7. Schema validation against live responses
	// =========================================================================

	describe("schema validation", () => {
		test("user profile passes Zod schema", async () => {
			const user = await client.getUser();
			expect(user.id).toBeDefined();
			expect(typeof user.id).toBe("string");
		});

		test("following list passes Zod schema", async () => {
			const following = await client.getFollowing();
			expect(following.length).toBeGreaterThan(0);
			for (const user of following) {
				expect(typeof user.id).toBe("string");
			}
		});

		test("getUserLinks passes Zod schema for all links", async () => {
			const links = await client.getUserLinks();
			for (const link of links) {
				expect(typeof link.id).toBe("string");
				expect(Array.isArray(link.highlights)).toBe(true);
			}
		});

		test("network info passes Zod schema", async () => {
			const info = await client.getNetworkInfo(
				"https://paulgraham.com/greatwork.html"
			);
			expect(info).not.toBeNull();
			expect(typeof info!.id).toBe("string");
			for (const user of info!.users) {
				expect(typeof user.id).toBe("string");
				expect(typeof user.firstName).toBe("string");
			}
		});
	});
});
