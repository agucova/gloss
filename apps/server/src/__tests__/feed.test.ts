import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
	type TestUser,
	VALID_SELECTOR,
	authenticatedRequest,
	cleanupTestUser,
	createTestFriendship,
	createTestUser,
	unauthenticatedRequest,
} from "./setup";
import { createTestApp } from "./test-app";

const app = createTestApp();

let userA: TestUser;
let userB: TestUser;

beforeAll(async () => {
	userA = await createTestUser({ name: "Feed User A" });
	userB = await createTestUser({ name: "Feed User B" });
	await createTestFriendship(userA.id, userB.id);

	// Create some highlights from userB that should appear in userA's feed
	await authenticatedRequest(app, "POST", "/api/highlights", userB, {
		body: {
			url: "https://example.com/feed-article",
			selector: VALID_SELECTOR,
			text: "Feed test highlight from user B",
			visibility: "friends",
		},
	});

	// Create a public bookmark from userB
	await authenticatedRequest(app, "POST", "/api/bookmarks", userB, {
		body: {
			url: "https://example.com/feed-bookmark",
			title: "Feed Bookmark from B",
		},
	});
});

afterAll(async () => {
	await cleanupTestUser(userA.id);
	await cleanupTestUser(userB.id);
});

describe("GET /api/feed", () => {
	it("should return friends' highlights", async () => {
		const res = await authenticatedRequest(app, "GET", "/api/feed", userA, {
			query: { limit: "20" },
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.items).toBeDefined();
		expect(Array.isArray(data.items)).toBe(true);

		// Should contain userB's highlights
		const fromB = data.items.filter((h: any) => h.userId === userB.id);
		expect(fromB.length).toBeGreaterThanOrEqual(1);
	});

	it("should not include own highlights in feed", async () => {
		// Create a highlight from userA
		await authenticatedRequest(app, "POST", "/api/highlights", userA, {
			body: {
				url: "https://example.com/own-highlight-feed",
				selector: VALID_SELECTOR,
				text: "My own highlight",
				visibility: "friends",
			},
		});

		const res = await authenticatedRequest(app, "GET", "/api/feed", userA, {
			query: { limit: "50" },
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		// Feed should not contain own highlights
		const ownHighlights = data.items.filter((h: any) => h.userId === userA.id);
		expect(ownHighlights.length).toBe(0);
	});

	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(app, "GET", "/api/feed", {
			query: { limit: "10" },
		});

		expect(res.status).toBe(401);
	});

	it("should return empty feed for user with no friends", async () => {
		const lonelyUser = await createTestUser({ name: "Lonely User" });

		const res = await authenticatedRequest(
			app,
			"GET",
			"/api/feed",
			lonelyUser,
			{
				query: { limit: "10" },
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.items).toEqual([]);

		await cleanupTestUser(lonelyUser.id);
	});
});

describe("GET /api/feed/bookmarks", () => {
	it("should return friends' bookmarks", async () => {
		const res = await authenticatedRequest(
			app,
			"GET",
			"/api/feed/bookmarks",
			userA,
			{
				query: { limit: "20" },
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.items).toBeDefined();
		expect(Array.isArray(data.items)).toBe(true);

		// Should contain userB's bookmarks
		const fromB = data.items.filter((b: any) => b.userId === userB.id);
		expect(fromB.length).toBeGreaterThanOrEqual(1);
	});

	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(
			app,
			"GET",
			"/api/feed/bookmarks",
			{
				query: { limit: "10" },
			}
		);

		expect(res.status).toBe(401);
	});
});
