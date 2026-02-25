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
	userA = await createTestUser({ name: "Highlight User A" });
	userB = await createTestUser({ name: "Highlight User B" });
	await createTestFriendship(userA.id, userB.id);
});

afterAll(async () => {
	await cleanupTestUser(userA.id);
	await cleanupTestUser(userB.id);
});

describe("POST /api/highlights", () => {
	it("should create a highlight when authenticated", async () => {
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/highlights",
			userA,
			{
				body: {
					url: "https://example.com/article",
					selector: VALID_SELECTOR,
					text: "This is a test highlight",
					visibility: "public",
				},
			}
		);

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.id).toBeDefined();
		expect(data.text).toBe("This is a test highlight");
		expect(data.visibility).toBe("public");
		expect(data.userId).toBe(userA.id);
	});

	it("should default visibility to friends", async () => {
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/highlights",
			userA,
			{
				body: {
					url: "https://example.com/article-2",
					selector: VALID_SELECTOR,
					text: "Default visibility highlight",
				},
			}
		);

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.visibility).toBe("friends");
	});

	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(app, "POST", "/api/highlights", {
			body: {
				url: "https://example.com/article",
				selector: VALID_SELECTOR,
				text: "Unauthenticated highlight",
			},
		});

		expect(res.status).toBe(401);
	});
});

describe("GET /api/highlights", () => {
	it("should return public highlights for unauthenticated users", async () => {
		// First create a public highlight
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/highlights",
			userA,
			{
				body: {
					url: "https://example.com/public-page",
					selector: VALID_SELECTOR,
					text: "Public highlight for GET test",
					visibility: "public",
				},
			}
		);
		expect(createRes.status).toBe(201);

		// Fetch highlights for that URL without auth
		const res = await unauthenticatedRequest(app, "GET", "/api/highlights", {
			query: { url: "https://example.com/public-page" },
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(Array.isArray(data)).toBe(true);
		const publicHighlights = data.filter(
			(h: any) => h.text === "Public highlight for GET test"
		);
		expect(publicHighlights.length).toBeGreaterThanOrEqual(1);
	});

	it("should return highlights with user info", async () => {
		// Create a public highlight
		await authenticatedRequest(app, "POST", "/api/highlights", userA, {
			body: {
				url: "https://example.com/user-info-test",
				selector: VALID_SELECTOR,
				text: "Highlight with user info",
				visibility: "public",
			},
		});

		const res = await unauthenticatedRequest(app, "GET", "/api/highlights", {
			query: { url: "https://example.com/user-info-test" },
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		const found = data.find((h: any) => h.text === "Highlight with user info");
		expect(found).toBeDefined();
		expect(found.user).toBeDefined();
		expect(found.user.id).toBe(userA.id);
		expect(found.user.name).toBe(userA.name);
	});
});

describe("GET /api/highlights/mine", () => {
	it("should return own highlights when authenticated", async () => {
		const res = await authenticatedRequest(
			app,
			"GET",
			"/api/highlights/mine",
			userA,
			{
				query: { limit: "10" },
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.items).toBeDefined();
		expect(Array.isArray(data.items)).toBe(true);
		// All returned highlights should belong to userA
		for (const item of data.items) {
			expect(item.userId).toBe(userA.id);
		}
	});

	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(
			app,
			"GET",
			"/api/highlights/mine",
			{
				query: { limit: "10" },
			}
		);

		expect(res.status).toBe(401);
	});
});

describe("PATCH /api/highlights/:id", () => {
	it("should update own highlight visibility", async () => {
		// Create a highlight
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/highlights",
			userA,
			{
				body: {
					url: "https://example.com/patch-test",
					selector: VALID_SELECTOR,
					text: "Highlight to patch",
					visibility: "friends",
				},
			}
		);
		const created = await createRes.json();

		// Update its visibility
		const res = await authenticatedRequest(
			app,
			"PATCH",
			`/api/highlights/${created.id}`,
			userA,
			{
				body: { visibility: "public" },
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.visibility).toBe("public");
	});

	it("should return 403 when updating someone else's highlight", async () => {
		// Create as userA
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/highlights",
			userA,
			{
				body: {
					url: "https://example.com/forbidden-patch",
					selector: VALID_SELECTOR,
					text: "Not yours to update",
				},
			}
		);
		const created = await createRes.json();

		// Try to update as userB
		const res = await authenticatedRequest(
			app,
			"PATCH",
			`/api/highlights/${created.id}`,
			userB,
			{
				body: { visibility: "public" },
			}
		);

		expect(res.status).toBe(403);
	});

	it("should return 404 for non-existent highlight", async () => {
		const res = await authenticatedRequest(
			app,
			"PATCH",
			"/api/highlights/nonexistent_id_12345",
			userA,
			{
				body: { visibility: "public" },
			}
		);

		expect(res.status).toBe(404);
	});
});

describe("DELETE /api/highlights/:id", () => {
	it("should delete own highlight", async () => {
		// Create a highlight
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/highlights",
			userA,
			{
				body: {
					url: "https://example.com/delete-test",
					selector: VALID_SELECTOR,
					text: "Highlight to delete",
				},
			}
		);
		const created = await createRes.json();

		// Delete it
		const res = await authenticatedRequest(
			app,
			"DELETE",
			`/api/highlights/${created.id}`,
			userA
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.success).toBe(true);
	});

	it("should return 403 when deleting someone else's highlight", async () => {
		// Create as userA
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/highlights",
			userA,
			{
				body: {
					url: "https://example.com/forbidden-delete",
					selector: VALID_SELECTOR,
					text: "Not yours to delete",
				},
			}
		);
		const created = await createRes.json();

		// Try to delete as userB
		const res = await authenticatedRequest(
			app,
			"DELETE",
			`/api/highlights/${created.id}`,
			userB
		);

		expect(res.status).toBe(403);
	});

	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(
			app,
			"DELETE",
			"/api/highlights/some_id"
		);

		expect(res.status).toBe(401);
	});
});
