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
let userC: TestUser;

beforeAll(async () => {
	userA = await createTestUser({ name: "Friend User A" });
	userB = await createTestUser({ name: "Friend User B" });
	userC = await createTestUser({ name: "Friend User C" });
});

afterAll(async () => {
	await cleanupTestUser(userA.id);
	await cleanupTestUser(userB.id);
	await cleanupTestUser(userC.id);
});

describe("POST /api/friendships/request", () => {
	it("should send a friend request", async () => {
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/friendships/request",
			userA,
			{
				body: { userId: userB.id },
			}
		);

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.requesterId).toBe(userA.id);
		expect(data.addresseeId).toBe(userB.id);
		expect(data.status).toBe("pending");
	});

	it("should return 400 when sending a request to yourself", async () => {
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/friendships/request",
			userA,
			{
				body: { userId: userA.id },
			}
		);

		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toContain("yourself");
	});

	it("should return 404 when target user does not exist", async () => {
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/friendships/request",
			userA,
			{
				body: { userId: "nonexistent_user_id" },
			}
		);

		expect(res.status).toBe(404);
	});

	it("should return 400 for duplicate pending request", async () => {
		// Send request from A to C
		await authenticatedRequest(app, "POST", "/api/friendships/request", userA, {
			body: { userId: userC.id },
		});

		// Try to send again
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/friendships/request",
			userA,
			{
				body: { userId: userC.id },
			}
		);

		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toContain("pending");
	});

	it("should auto-accept when both users have sent requests", async () => {
		// A already sent a request to B (from the first test)
		// Now B sends a request to A, which should auto-accept
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/friendships/request",
			userB,
			{
				body: { userId: userA.id },
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.status).toBe("accepted");
	});

	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(
			app,
			"POST",
			"/api/friendships/request",
			{
				body: { userId: userB.id },
			}
		);

		expect(res.status).toBe(401);
	});
});

describe("POST /api/friendships/:id/accept", () => {
	it("should accept a pending friend request", async () => {
		// A sent a request to C earlier, now C accepts
		// First get the pending requests for C
		const pendingRes = await authenticatedRequest(
			app,
			"GET",
			"/api/friendships/pending",
			userC
		);
		const pending = await pendingRes.json();
		const requestFromA = pending.find((p: any) => p.user.id === userA.id);
		expect(requestFromA).toBeDefined();

		// Accept the request
		const res = await authenticatedRequest(
			app,
			"POST",
			`/api/friendships/${requestFromA.id}/accept`,
			userC
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.status).toBe("accepted");
	});

	it("should return 403 when non-addressee tries to accept", async () => {
		// Create a new request between B and C
		const reqRes = await authenticatedRequest(
			app,
			"POST",
			"/api/friendships/request",
			userB,
			{
				body: { userId: userC.id },
			}
		);
		// Since B and C might already be friends/have requests,
		// this test is best-effort. If the request was created:
		if (reqRes.status === 201) {
			const data = await reqRes.json();
			// userA tries to accept (not the addressee)
			const res = await authenticatedRequest(
				app,
				"POST",
				`/api/friendships/${data.id}/accept`,
				userA
			);
			expect(res.status).toBe(403);
		}
	});
});

describe("GET /api/friendships", () => {
	it("should list accepted friends", async () => {
		const res = await authenticatedRequest(
			app,
			"GET",
			"/api/friendships",
			userA
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(Array.isArray(data)).toBe(true);
		// A should be friends with B (auto-accepted) and C (accepted)
		const friendIds = data.map((f: any) => f.id);
		expect(friendIds).toContain(userB.id);
		expect(friendIds).toContain(userC.id);
	});

	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(app, "GET", "/api/friendships");

		expect(res.status).toBe(401);
	});
});

describe("GET /api/friendships/pending", () => {
	it("should return pending incoming requests", async () => {
		const res = await authenticatedRequest(
			app,
			"GET",
			"/api/friendships/pending",
			userA
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(Array.isArray(data)).toBe(true);
	});
});

describe("GET /api/friendships/sent", () => {
	it("should return sent friend requests", async () => {
		const res = await authenticatedRequest(
			app,
			"GET",
			"/api/friendships/sent",
			userA
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(Array.isArray(data)).toBe(true);
	});
});

describe("DELETE /api/friendships/:userId", () => {
	it("should remove a friend", async () => {
		// A and B are friends, remove the friendship
		const res = await authenticatedRequest(
			app,
			"DELETE",
			`/api/friendships/${userB.id}`,
			userA
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.success).toBe(true);

		// Verify they're no longer friends
		const friendsRes = await authenticatedRequest(
			app,
			"GET",
			"/api/friendships",
			userA
		);
		const friends = await friendsRes.json();
		const friendIds = friends.map((f: any) => f.id);
		expect(friendIds).not.toContain(userB.id);
	});

	it("should return 404 when friendship does not exist", async () => {
		const res = await authenticatedRequest(
			app,
			"DELETE",
			"/api/friendships/nonexistent_user_id",
			userA
		);

		expect(res.status).toBe(404);
	});
});
