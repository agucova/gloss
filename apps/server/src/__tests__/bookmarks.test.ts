import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
	type TestUser,
	authenticatedRequest,
	cleanupTestUser,
	createTestUser,
	unauthenticatedRequest,
} from "./setup";
import { createTestApp } from "./test-app";

const app = createTestApp();

let userA: TestUser;
let userB: TestUser;

beforeAll(async () => {
	userA = await createTestUser({ name: "Bookmark User A" });
	userB = await createTestUser({ name: "Bookmark User B" });
});

afterAll(async () => {
	await cleanupTestUser(userA.id);
	await cleanupTestUser(userB.id);
});

describe("POST /api/bookmarks", () => {
	it("should create a bookmark when authenticated", async () => {
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/bookmarks",
			userA,
			{
				body: {
					url: "https://example.com/bookmark-1",
					title: "Test Bookmark",
					description: "A bookmark for testing",
				},
			}
		);

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.id).toBeDefined();
		expect(data.title).toBe("Test Bookmark");
		expect(data.description).toBe("A bookmark for testing");
		expect(data.userId).toBe(userA.id);
	});

	it("should create a bookmark with tags", async () => {
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/bookmarks",
			userA,
			{
				body: {
					url: "https://example.com/bookmark-with-tags",
					title: "Tagged Bookmark",
					tags: ["research", "ai-safety"],
				},
			}
		);

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.tags).toBeDefined();
		expect(data.tags.length).toBe(2);
		const tagNames = data.tags.map((t: any) => t.name);
		expect(tagNames).toContain("research");
		expect(tagNames).toContain("ai-safety");
	});

	it("should return 409 when bookmarking the same URL twice", async () => {
		// First bookmark
		await authenticatedRequest(app, "POST", "/api/bookmarks", userA, {
			body: {
				url: "https://example.com/duplicate-bookmark",
				title: "First",
			},
		});

		// Second bookmark for same URL
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/bookmarks",
			userA,
			{
				body: {
					url: "https://example.com/duplicate-bookmark",
					title: "Second",
				},
			}
		);

		expect(res.status).toBe(409);
		const data = await res.json();
		expect(data.error).toContain("already bookmarked");
	});

	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(app, "POST", "/api/bookmarks", {
			body: {
				url: "https://example.com/unauth-bookmark",
				title: "Unauthorized",
			},
		});

		expect(res.status).toBe(401);
	});
});

describe("GET /api/bookmarks", () => {
	it("should list user's bookmarks", async () => {
		const res = await authenticatedRequest(
			app,
			"GET",
			"/api/bookmarks",
			userA,
			{
				query: { limit: "10" },
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.items).toBeDefined();
		expect(Array.isArray(data.items)).toBe(true);
		// All returned bookmarks should belong to userA
		for (const item of data.items) {
			expect(item.userId).toBe(userA.id);
		}
	});

	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(app, "GET", "/api/bookmarks", {
			query: { limit: "10" },
		});

		expect(res.status).toBe(401);
	});
});

describe("GET /api/bookmarks/check", () => {
	it("should return bookmarked=true for existing bookmark", async () => {
		// Ensure a bookmark exists
		await authenticatedRequest(app, "POST", "/api/bookmarks", userA, {
			body: {
				url: "https://example.com/check-test",
				title: "Check Test",
			},
		});

		const res = await authenticatedRequest(
			app,
			"GET",
			"/api/bookmarks/check",
			userA,
			{
				query: { url: "https://example.com/check-test" },
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.bookmarked).toBe(true);
		expect(data.bookmark).toBeDefined();
	});

	it("should return bookmarked=false for non-existent bookmark", async () => {
		const res = await authenticatedRequest(
			app,
			"GET",
			"/api/bookmarks/check",
			userA,
			{
				query: { url: "https://example.com/not-bookmarked" },
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.bookmarked).toBe(false);
	});
});

describe("PATCH /api/bookmarks/:id", () => {
	it("should update bookmark title and description", async () => {
		// Create a bookmark
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/bookmarks",
			userA,
			{
				body: {
					url: "https://example.com/patch-bookmark",
					title: "Original Title",
				},
			}
		);
		const created = await createRes.json();

		// Update it
		const res = await authenticatedRequest(
			app,
			"PATCH",
			`/api/bookmarks/${created.id}`,
			userA,
			{
				body: {
					title: "Updated Title",
					description: "New description",
				},
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.title).toBe("Updated Title");
		expect(data.description).toBe("New description");
	});

	it("should update bookmark tags", async () => {
		// Create a bookmark with tags
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/bookmarks",
			userA,
			{
				body: {
					url: "https://example.com/tag-update-test",
					title: "Tag Update Test",
					tags: ["original-tag"],
				},
			}
		);
		const created = await createRes.json();

		// Update tags
		const res = await authenticatedRequest(
			app,
			"PATCH",
			`/api/bookmarks/${created.id}`,
			userA,
			{
				body: {
					tags: ["new-tag-1", "new-tag-2"],
				},
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.tags).toBeDefined();
		expect(data.tags.length).toBe(2);
		const tagNames = data.tags.map((t: any) => t.name);
		expect(tagNames).toContain("new-tag-1");
		expect(tagNames).toContain("new-tag-2");
		expect(tagNames).not.toContain("original-tag");
	});

	it("should return 403 when updating someone else's bookmark", async () => {
		// Create as userA
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/bookmarks",
			userA,
			{
				body: {
					url: "https://example.com/forbidden-patch-bk",
					title: "Not Yours",
				},
			}
		);
		const created = await createRes.json();

		// Try to update as userB
		const res = await authenticatedRequest(
			app,
			"PATCH",
			`/api/bookmarks/${created.id}`,
			userB,
			{
				body: { title: "Stolen" },
			}
		);

		expect(res.status).toBe(403);
	});
});

describe("DELETE /api/bookmarks/:id", () => {
	it("should delete own bookmark", async () => {
		// Create a bookmark
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/bookmarks",
			userA,
			{
				body: {
					url: "https://example.com/delete-bookmark",
					title: "To Delete",
				},
			}
		);
		const created = await createRes.json();

		// Delete it
		const res = await authenticatedRequest(
			app,
			"DELETE",
			`/api/bookmarks/${created.id}`,
			userA
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.success).toBe(true);
	});

	it("should return 404 for non-existent bookmark", async () => {
		const res = await authenticatedRequest(
			app,
			"DELETE",
			"/api/bookmarks/nonexistent_bookmark_id",
			userA
		);

		expect(res.status).toBe(404);
	});

	it("should return 403 when deleting someone else's bookmark", async () => {
		// Create as userA
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/bookmarks",
			userA,
			{
				body: {
					url: "https://example.com/forbidden-delete-bk",
					title: "Not Yours",
				},
			}
		);
		const created = await createRes.json();

		// Try to delete as userB
		const res = await authenticatedRequest(
			app,
			"DELETE",
			`/api/bookmarks/${created.id}`,
			userB
		);

		expect(res.status).toBe(403);
	});
});

describe("POST /api/bookmarks/:id/favorite", () => {
	it("should toggle favorite on a bookmark", async () => {
		// Create a bookmark
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/bookmarks",
			userA,
			{
				body: {
					url: "https://example.com/favorite-test",
					title: "Favorite Test",
				},
			}
		);
		const created = await createRes.json();

		// Toggle favorite on
		const res1 = await authenticatedRequest(
			app,
			"POST",
			`/api/bookmarks/${created.id}/favorite`,
			userA
		);
		expect(res1.status).toBe(200);
		const data1 = await res1.json();
		expect(data1.favorited).toBe(true);

		// Toggle favorite off
		const res2 = await authenticatedRequest(
			app,
			"POST",
			`/api/bookmarks/${created.id}/favorite`,
			userA
		);
		expect(res2.status).toBe(200);
		const data2 = await res2.json();
		expect(data2.favorited).toBe(false);
	});
});
