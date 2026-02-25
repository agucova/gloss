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

beforeAll(async () => {
	userA = await createTestUser({ name: "Search Test User" });
});

afterAll(async () => {
	await cleanupTestUser(userA.id);
});

describe("GET /api/search/capabilities", () => {
	it("should return search capabilities", async () => {
		const res = await authenticatedRequest(
			app,
			"GET",
			"/api/search/capabilities",
			userA
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.supportedModes).toBeDefined();
		expect(Array.isArray(data.supportedModes)).toBe(true);
		expect(data.supportedModes).toContain("fts");
		expect(data.supportedTypes).toContain("bookmark");
		expect(data.supportedTypes).toContain("highlight");
		expect(data.supportedTypes).toContain("comment");
	});
});

describe("GET /api/search", () => {
	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(app, "GET", "/api/search", {
			query: { q: "test" },
		});

		expect(res.status).toBe(401);
	});

	it("should return results structure for a query", async () => {
		const res = await authenticatedRequest(app, "GET", "/api/search", userA, {
			query: { q: "test query" },
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.results).toBeDefined();
		expect(Array.isArray(data.results)).toBe(true);
		expect(data.meta).toBeDefined();
		expect(data.meta.query).toBe("test query");
	});

	it("should respect the limit parameter", async () => {
		const res = await authenticatedRequest(app, "GET", "/api/search", userA, {
			query: { q: "test", limit: "5" },
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.meta.limit).toBe(5);
	});

	it("should return 400 for invalid mode", async () => {
		const res = await authenticatedRequest(app, "GET", "/api/search", userA, {
			query: { q: "test", mode: "invalid" },
		});

		expect(res.status).toBe(400);
	});

	it("should return 400 for invalid sortBy", async () => {
		const res = await authenticatedRequest(app, "GET", "/api/search", userA, {
			query: { q: "test", sortBy: "invalid" },
		});

		expect(res.status).toBe(400);
	});

	it("should filter by entity type", async () => {
		const res = await authenticatedRequest(app, "GET", "/api/search", userA, {
			query: { q: "test", types: "bookmark" },
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		// All results should be bookmarks (if any)
		for (const result of data.results) {
			expect(result.type).toBe("bookmark");
		}
	});
});
