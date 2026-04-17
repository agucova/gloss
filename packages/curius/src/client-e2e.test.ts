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

		test("every link in the full account parses against the schema", async () => {
			// Zod safeParse runs inside the client for the whole response, so a
			// successful call implies every entry parsed. This test hardens that
			// guarantee by iterating and asserting the invariants the importer
			// will rely on: stable string id, a URL in `url` or `link`, and a
			// highlights array whose entries also expose string ids.
			const links = await client.getUserLinks();

			// The account must be non-trivially populated for this test to mean
			// anything as a schema-drift probe.
			expect(links.length).toBeGreaterThan(10);

			for (const link of links) {
				expect(typeof link.id).toBe("string");
				expect(link.id.length).toBeGreaterThan(0);
				expect(typeof (link.url ?? link.link)).toBe("string");
				expect(Array.isArray(link.highlights)).toBe(true);

				for (const hl of link.highlights) {
					expect(typeof hl.id).toBe("string");
					// At least one of the highlight-text fields must be populated.
					expect(
						typeof (hl.highlight ?? hl.rawHighlight ?? hl.highlightText)
					).toBe("string");
				}
			}
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

		test("getLinkByUrl behavior across URL variants (normalization probe)", async () => {
			// Documents how Curius matches URLs so the importer can dedup safely.
			// Each variant must either hit the same link or miss (null) — it must
			// never return a different link and must never throw.
			const variants = {
				trailingSlash: `${TEST_URL}/`,
				queryParam: `${TEST_URL}?utm_source=gloss-e2e`,
				fragment: `${TEST_URL}#section`,
				uppercaseScheme: TEST_URL.replace(/^https/, "HTTPS"),
			};

			const results: Record<string, "match" | "null"> = {};
			for (const [name, url] of Object.entries(variants)) {
				const found = await client.getLinkByUrl(url);
				if (found === null) {
					results[name] = "null";
				} else {
					expect(found.id).toBe(testLink.id);
					results[name] = "match";
				}
			}

			console.log("[curius e2e] URL normalization behavior:", results);
		});

		test("renameLink updates the title", async () => {
			const newTitle = `Gloss E2E Renamed ${Date.now()}`;
			await client.renameLink(testLink.id, newTitle);

			const links = await client.getUserLinks();
			const match = links.find((l) => l.id === testLink.id);
			expect(match).toBeDefined();
			expect(match!.title).toBe(newTitle);
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

		test("highlights with unicode and newlines roundtrip intact", async () => {
			// Real Curius highlights often contain smart quotes, emoji, accented
			// characters, and embedded newlines from multi-paragraph selections.
			// The importer must round-trip these byte-for-byte, and
			// deleteHighlight (which matches by text) must still find them.
			const unicodeHighlight = {
				rawHighlight: "Café — “naïve” approach\nwith emoji 🎉 and 日本語",
				leftContext: "",
				rightContext: "",
			};

			await client.addHighlight(testLink.id, unicodeHighlight);

			const afterAdd = await client.getUserLinks();
			const match = afterAdd.find((l) => l.id === testLink.id);
			expect(match).toBeDefined();
			const hlTexts = match!.highlights.map(
				(h) => h.highlight ?? h.rawHighlight ?? h.highlightText
			);
			expect(hlTexts).toContain(unicodeHighlight.rawHighlight);

			await client.deleteHighlight(testLink.id, unicodeHighlight.rawHighlight);

			const afterDelete = await client.getUserLinks();
			const stillThere = afterDelete
				.find((l) => l.id === testLink.id)!
				.highlights.map(
					(h) => h.highlight ?? h.rawHighlight ?? h.highlightText
				);
			expect(stillThere).not.toContain(unicodeHighlight.rawHighlight);
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

	// =========================================================================
	// 8. Feed endpoints — contract probes for the dashboard bridge
	// =========================================================================

	describe("feed endpoints (contract tests)", () => {
		test("getLibrary({page: 0}) returns a parseable response with the expected fields", async () => {
			const result = await client.getLibrary({ page: 0 });
			expect(Array.isArray(result.library)).toBe(true);

			// Every entry must have id (string) and a URL. highlights is always
			// an array — empty when the friend just saved the link, non-empty
			// otherwise.
			for (const entry of result.library) {
				expect(typeof entry.id).toBe("string");
				expect(typeof entry.link).toBe("string");
				expect(Array.isArray(entry.highlights)).toBe(true);
				expect(Array.isArray(entry.users)).toBe(true);

				for (const hl of entry.highlights) {
					expect(typeof hl.id).toBe("string");
					expect(typeof hl.userId).toBe("string");
					// At least one of the text fields must be populated for the
					// highlight to be renderable.
					const text = hl.rawHighlight ?? hl.highlightText ?? hl.highlight;
					expect(typeof text).toBe("string");
				}
			}
		});

		test("getLibrary pagination: high page number returns a well-formed response", async () => {
			// Might be empty if the account doesn't have that much feed, but the
			// shape contract must hold.
			const result = await client.getLibrary({ page: 99 });
			expect(Array.isArray(result.library)).toBe(true);
		});

		test("INVARIANT: every library author is someone the user follows", async () => {
			const [library, following] = await Promise.all([
				client.getLibrary({ page: 0 }),
				client.getFollowing(),
			]);
			const followedIds = new Set(following.map((u) => u.id));

			const authorIds = new Set<string>();
			for (const entry of library.library) {
				for (const u of entry.users) authorIds.add(u.id);
			}

			const outsiders = Array.from(authorIds).filter(
				(id) => !followedIds.has(id)
			);
			expect(outsiders).toEqual([]);
		});

		test("getActivity returns a parseable response; `type` values are enumerable", async () => {
			const result = await client.getActivity();
			expect(Array.isArray(result.activity)).toBe(true);

			// Build a report of types observed so schema-filter sets can be
			// kept in sync with reality. Doesn't fail if unexpected types
			// appear — the schema is intentionally permissive.
			const counts = new Map<string, number>();
			for (const item of result.activity) {
				const t = item.type ?? "__null__";
				counts.set(t, (counts.get(t) ?? 0) + 1);
			}
			console.log("[curius e2e] /api/activity types observed:", counts);

			// At minimum, a live account that's been around should have at
			// least one event of some kind.
			expect(result.activity.length).toBeGreaterThan(0);
		});

		test("getAllUsers returns a populated directory of parseable users", async () => {
			const users = await client.getAllUsers();
			expect(users.length).toBeGreaterThan(100); // account has ~6000 peers
			for (const u of users.slice(0, 20)) {
				expect(typeof u.id).toBe("string");
				expect(typeof u.firstName).toBe("string");
				expect(typeof u.userLink).toBe("string");
			}
		});
	});
});
