import { db } from "@gloss/db";
import { friendship } from "@gloss/db/schema";
import { and, eq, or } from "drizzle-orm";

/**
 * Get all accepted friend IDs for a user.
 * Returns an array of user IDs who are friends with the given user.
 */
export async function getFriendIds(userId: string): Promise<string[]> {
	const friendships = await db.query.friendship.findMany({
		where: and(
			eq(friendship.status, "accepted"),
			or(eq(friendship.requesterId, userId), eq(friendship.addresseeId, userId))
		),
	});

	return friendships.map((f) =>
		f.requesterId === userId ? f.addresseeId : f.requesterId
	);
}

/**
 * Check if two users are friends.
 */
export async function areFriends(
	userId1: string,
	userId2: string
): Promise<boolean> {
	const existing = await db.query.friendship.findFirst({
		where: and(
			eq(friendship.status, "accepted"),
			or(
				and(
					eq(friendship.requesterId, userId1),
					eq(friendship.addresseeId, userId2)
				),
				and(
					eq(friendship.requesterId, userId2),
					eq(friendship.addresseeId, userId1)
				)
			)
		),
	});

	return existing !== undefined;
}
