import { db } from "@gloss/db";
import { friendship, user } from "@gloss/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { deriveAuth } from "../lib/auth";
import { getFriendIds } from "../lib/friends";
import { FriendRequestSchema } from "../models";

/**
 * Friendships routes.
 * All routes require authentication.
 */
export const friendships = new Elysia({ prefix: "/friendships" })
	// Derive session for all friendship routes
	.derive(async ({ request }) => deriveAuth(request))

	// Send a friend request
	.post(
		"/request",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const requesterId = session.user.id;
			const addresseeId = body.userId;

			// Can't friend yourself
			if (requesterId === addresseeId) {
				set.status = 400;
				return { error: "Cannot send friend request to yourself" };
			}

			// Check if target user exists
			const targetUser = await db.query.user.findFirst({
				where: eq(user.id, addresseeId),
			});
			if (!targetUser) {
				set.status = 404;
				return { error: "User not found" };
			}

			// Check if friendship already exists (in either direction)
			const existing = await db.query.friendship.findFirst({
				where: or(
					and(
						eq(friendship.requesterId, requesterId),
						eq(friendship.addresseeId, addresseeId)
					),
					and(
						eq(friendship.requesterId, addresseeId),
						eq(friendship.addresseeId, requesterId)
					)
				),
			});

			if (existing) {
				if (existing.status === "accepted") {
					set.status = 400;
					return { error: "Already friends with this user" };
				}
				if (existing.status === "pending") {
					// If they sent us a request, auto-accept it
					if (existing.requesterId === addresseeId) {
						const updated = await db
							.update(friendship)
							.set({ status: "accepted" })
							.where(eq(friendship.id, existing.id))
							.returning();
						return { ...updated[0], message: "Friend request accepted" };
					}
					set.status = 400;
					return { error: "Friend request already pending" };
				}
				if (existing.status === "rejected") {
					// Allow re-requesting after rejection
					const updated = await db
						.update(friendship)
						.set({ status: "pending", requesterId, addresseeId })
						.where(eq(friendship.id, existing.id))
						.returning();
					return updated[0];
				}
			}

			const newFriendship = await db
				.insert(friendship)
				.values({
					id: createId(),
					requesterId,
					addresseeId,
					status: "pending",
				})
				.returning();

			set.status = 201;
			return newFriendship[0];
		},
		{
			body: FriendRequestSchema,
		}
	)

	// Accept a friend request
	.post(
		"/:id/accept",
		async ({ params, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const friendshipRecord = await db.query.friendship.findFirst({
				where: eq(friendship.id, params.id),
			});

			if (!friendshipRecord) {
				set.status = 404;
				return { error: "Friend request not found" };
			}

			// Only the addressee can accept
			if (friendshipRecord.addresseeId !== session.user.id) {
				set.status = 403;
				return { error: "Not authorized to accept this request" };
			}

			if (friendshipRecord.status !== "pending") {
				set.status = 400;
				return { error: "Request is not pending" };
			}

			const updated = await db
				.update(friendship)
				.set({ status: "accepted" })
				.where(eq(friendship.id, params.id))
				.returning();

			return updated[0];
		},
		{
			params: t.Object({
				id: t.String(),
			}),
		}
	)

	// Reject a friend request
	.post(
		"/:id/reject",
		async ({ params, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const friendshipRecord = await db.query.friendship.findFirst({
				where: eq(friendship.id, params.id),
			});

			if (!friendshipRecord) {
				set.status = 404;
				return { error: "Friend request not found" };
			}

			// Only the addressee can reject
			if (friendshipRecord.addresseeId !== session.user.id) {
				set.status = 403;
				return { error: "Not authorized to reject this request" };
			}

			if (friendshipRecord.status !== "pending") {
				set.status = 400;
				return { error: "Request is not pending" };
			}

			const updated = await db
				.update(friendship)
				.set({ status: "rejected" })
				.where(eq(friendship.id, params.id))
				.returning();

			return updated[0];
		},
		{
			params: t.Object({
				id: t.String(),
			}),
		}
	)

	// Remove a friend
	.delete(
		"/:userId",
		async ({ params, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const currentUserId = session.user.id;
			const targetUserId = params.userId;

			// Find the friendship
			const friendshipRecord = await db.query.friendship.findFirst({
				where: and(
					eq(friendship.status, "accepted"),
					or(
						and(
							eq(friendship.requesterId, currentUserId),
							eq(friendship.addresseeId, targetUserId)
						),
						and(
							eq(friendship.requesterId, targetUserId),
							eq(friendship.addresseeId, currentUserId)
						)
					)
				),
			});

			if (!friendshipRecord) {
				set.status = 404;
				return { error: "Friendship not found" };
			}

			await db.delete(friendship).where(eq(friendship.id, friendshipRecord.id));

			return { success: true };
		},
		{
			params: t.Object({
				userId: t.String(),
			}),
		}
	)

	// List friends
	.get("/", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const currentUserId = session.user.id;

		const friendships = await db.query.friendship.findMany({
			where: and(
				eq(friendship.status, "accepted"),
				or(
					eq(friendship.requesterId, currentUserId),
					eq(friendship.addresseeId, currentUserId)
				)
			),
			with: {
				requester: {
					columns: { id: true, name: true, image: true, email: true },
				},
				addressee: {
					columns: { id: true, name: true, image: true, email: true },
				},
			},
		});

		// Extract the friend (the other user in each friendship)
		return friendships.map((f) =>
			f.requesterId === currentUserId ? f.addressee : f.requester
		);
	})

	// List pending incoming requests
	.get("/pending", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const pendingRequests = await db.query.friendship.findMany({
			where: and(
				eq(friendship.addresseeId, session.user.id),
				eq(friendship.status, "pending")
			),
			with: {
				requester: {
					columns: { id: true, name: true, image: true, email: true },
				},
			},
			orderBy: (friendship, { desc }) => [desc(friendship.createdAt)],
		});

		return pendingRequests.map((f) => ({
			id: f.id,
			user: f.requester,
			createdAt: f.createdAt,
		}));
	})

	// List sent requests
	.get("/sent", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const sentRequests = await db.query.friendship.findMany({
			where: and(
				eq(friendship.requesterId, session.user.id),
				eq(friendship.status, "pending")
			),
			with: {
				addressee: {
					columns: { id: true, name: true, image: true, email: true },
				},
			},
			orderBy: (friendship, { desc }) => [desc(friendship.createdAt)],
		});

		return sentRequests.map((f) => ({
			id: f.id,
			user: f.addressee,
			createdAt: f.createdAt,
		}));
	})

	// Search friends (for @mention autocomplete)
	.get(
		"/search",
		async ({ query, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const friendIds = await getFriendIds(session.user.id);
			if (friendIds.length === 0) {
				return [];
			}

			const results = await db.query.user.findMany({
				where: and(
					inArray(user.id, friendIds),
					ilike(user.name, `%${query.q}%`)
				),
				columns: { id: true, name: true, image: true },
				limit: 10,
			});

			return results;
		},
		{
			query: t.Object({ q: t.String() }),
		}
	);
