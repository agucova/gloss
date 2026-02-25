import { createId } from "@paralleldrive/cuid2";
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
	userA = await createTestUser({ name: "Users Test A" });
	userB = await createTestUser({ name: "Users Test B" });
});

afterAll(async () => {
	await cleanupTestUser(userA.id);
	await cleanupTestUser(userB.id);
});

describe("GET /api/users/me", () => {
	it("should return the current user's profile", async () => {
		const res = await authenticatedRequest(app, "GET", "/api/users/me", userA);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.id).toBe(userA.id);
		expect(data.name).toBe(userA.name);
		expect(data.email).toBe(userA.email);
		// Counts should be present
		expect(typeof data.highlightCount).toBe("number");
		expect(typeof data.bookmarkCount).toBe("number");
		expect(typeof data.friendCount).toBe("number");
	});

	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(app, "GET", "/api/users/me");

		expect(res.status).toBe(401);
	});
});

describe("PATCH /api/users/me", () => {
	it("should update user profile fields", async () => {
		const res = await authenticatedRequest(
			app,
			"PATCH",
			"/api/users/me",
			userA,
			{
				body: {
					name: "Updated Name A",
					bio: "I am a test user",
				},
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.name).toBe("Updated Name A");
		expect(data.bio).toBe("I am a test user");
	});

	it("should return 400 when no fields to update", async () => {
		const res = await authenticatedRequest(
			app,
			"PATCH",
			"/api/users/me",
			userA,
			{
				body: {},
			}
		);

		expect(res.status).toBe(400);
	});
});

describe("PUT /api/users/me/username", () => {
	it("should set a username", async () => {
		const username = `tu_${createId().slice(0, 10)}`;
		const res = await authenticatedRequest(
			app,
			"PUT",
			"/api/users/me/username",
			userA,
			{
				body: { username },
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.username).toBe(username.toLowerCase());
	});

	it("should return 409 when username is taken by another user", async () => {
		// Set username for userB
		const username = `tk_${createId().slice(0, 10)}`;
		await authenticatedRequest(app, "PUT", "/api/users/me/username", userB, {
			body: { username },
		});

		// Try to use the same username for userA
		const res = await authenticatedRequest(
			app,
			"PUT",
			"/api/users/me/username",
			userA,
			{
				body: { username },
			}
		);

		expect(res.status).toBe(409);
		const data = await res.json();
		expect(data.error).toContain("taken");
	});
});

describe("GET /api/users/check-username/:username", () => {
	it("should return available=true for unused username", async () => {
		const res = await authenticatedRequest(
			app,
			"GET",
			"/api/users/check-username/totally_unused_name_xyz",
			userA
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.available).toBe(true);
	});
});

describe("GET /api/users/me/settings", () => {
	it("should return user settings", async () => {
		const res = await authenticatedRequest(
			app,
			"GET",
			"/api/users/me/settings",
			userA
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		// Default settings
		expect(data.highlightDisplayFilter).toBeDefined();
		expect(data.commentDisplayMode).toBeDefined();
	});
});

describe("PATCH /api/users/me/settings", () => {
	it("should update user settings", async () => {
		const res = await authenticatedRequest(
			app,
			"PATCH",
			"/api/users/me/settings",
			userA,
			{
				body: {
					highlightDisplayFilter: "anyone",
					commentDisplayMode: "expanded",
				},
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.highlightDisplayFilter).toBe("anyone");
		expect(data.commentDisplayMode).toBe("expanded");
	});
});
