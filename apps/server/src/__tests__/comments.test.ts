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
let publicHighlightId: string;
let friendsHighlightId: string;

beforeAll(async () => {
	userA = await createTestUser({ name: "Comment User A" });
	userB = await createTestUser({ name: "Comment User B" });
	await createTestFriendship(userA.id, userB.id);

	// Create a public highlight from userA
	const publicRes = await authenticatedRequest(
		app,
		"POST",
		"/api/highlights",
		userA,
		{
			body: {
				url: "https://example.com/comment-test-public",
				selector: VALID_SELECTOR,
				text: "Public highlight for comments",
				visibility: "public",
			},
		}
	);
	const publicData = await publicRes.json();
	publicHighlightId = publicData.id;

	// Create a friends-only highlight from userA
	const friendsRes = await authenticatedRequest(
		app,
		"POST",
		"/api/highlights",
		userA,
		{
			body: {
				url: "https://example.com/comment-test-friends",
				selector: VALID_SELECTOR,
				text: "Friends highlight for comments",
				visibility: "friends",
			},
		}
	);
	const friendsData = await friendsRes.json();
	friendsHighlightId = friendsData.id;
});

afterAll(async () => {
	await cleanupTestUser(userA.id);
	await cleanupTestUser(userB.id);
});

describe("POST /api/comments", () => {
	it("should create a comment on own highlight", async () => {
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/comments",
			userA,
			{
				body: {
					highlightId: publicHighlightId,
					content: "My own comment on my highlight",
				},
			}
		);

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.content).toBe("My own comment on my highlight");
		expect(data.highlightId).toBe(publicHighlightId);
		expect(data.author.id).toBe(userA.id);
	});

	it("should allow a friend to comment on friends-only highlight", async () => {
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/comments",
			userB,
			{
				body: {
					highlightId: friendsHighlightId,
					content: "Comment from a friend",
				},
			}
		);

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.content).toBe("Comment from a friend");
		expect(data.author.id).toBe(userB.id);
	});

	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(app, "POST", "/api/comments", {
			body: {
				highlightId: publicHighlightId,
				content: "Unauthenticated comment",
			},
		});

		expect(res.status).toBe(401);
	});

	it("should return 404 for non-existent highlight", async () => {
		const res = await authenticatedRequest(
			app,
			"POST",
			"/api/comments",
			userA,
			{
				body: {
					highlightId: "nonexistent_highlight_id",
					content: "Comment on nothing",
				},
			}
		);

		expect(res.status).toBe(404);
	});
});

describe("GET /api/comments/highlight/:highlightId", () => {
	it("should return comments for a public highlight", async () => {
		const res = await authenticatedRequest(
			app,
			"GET",
			`/api/comments/highlight/${publicHighlightId}`,
			userA
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBeGreaterThanOrEqual(1);

		// Each comment should have author info
		for (const comment of data) {
			expect(comment.author).toBeDefined();
			expect(comment.author.id).toBeDefined();
		}
	});
});

describe("PATCH /api/comments/:id", () => {
	it("should update own comment", async () => {
		// Create a comment first
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/comments",
			userA,
			{
				body: {
					highlightId: publicHighlightId,
					content: "Original comment text",
				},
			}
		);
		const created = await createRes.json();

		// Update it
		const res = await authenticatedRequest(
			app,
			"PATCH",
			`/api/comments/${created.id}`,
			userA,
			{
				body: { content: "Updated comment text" },
			}
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.content).toBe("Updated comment text");
	});

	it("should return 403 when updating someone else's comment", async () => {
		// Create a comment as userA
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/comments",
			userA,
			{
				body: {
					highlightId: publicHighlightId,
					content: "A's comment to update",
				},
			}
		);
		const created = await createRes.json();

		// Try to update as userB
		const res = await authenticatedRequest(
			app,
			"PATCH",
			`/api/comments/${created.id}`,
			userB,
			{
				body: { content: "Stolen edit" },
			}
		);

		expect(res.status).toBe(403);
	});
});

describe("DELETE /api/comments/:id", () => {
	it("should soft-delete own comment", async () => {
		// Create a comment
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/comments",
			userA,
			{
				body: {
					highlightId: publicHighlightId,
					content: "Comment to delete",
				},
			}
		);
		const created = await createRes.json();

		// Delete it
		const res = await authenticatedRequest(
			app,
			"DELETE",
			`/api/comments/${created.id}`,
			userA
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.success).toBe(true);
	});

	it("should allow highlight owner to delete any comment on their highlight", async () => {
		// userB comments on userA's highlight
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/comments",
			userB,
			{
				body: {
					highlightId: publicHighlightId,
					content: "B's comment for A to delete",
				},
			}
		);
		const created = await createRes.json();

		// userA (highlight owner) deletes userB's comment
		const res = await authenticatedRequest(
			app,
			"DELETE",
			`/api/comments/${created.id}`,
			userA
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.success).toBe(true);
	});

	it("should return 401 when not authenticated", async () => {
		const res = await unauthenticatedRequest(
			app,
			"DELETE",
			"/api/comments/some_comment_id"
		);

		expect(res.status).toBe(401);
	});
});
