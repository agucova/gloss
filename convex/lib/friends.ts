import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

/**
 * Get all accepted friend IDs for a user.
 */
export async function getFriendIds(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">
): Promise<Id<"users">[]> {
	// Query friendships where user is requester
	const asRequester = await ctx.db
		.query("friendships")
		.withIndex("by_requesterId_status", (q) =>
			q.eq("requesterId", userId).eq("status", "accepted")
		)
		.collect();

	// Query friendships where user is addressee
	const asAddressee = await ctx.db
		.query("friendships")
		.withIndex("by_addresseeId_status", (q) =>
			q.eq("addresseeId", userId).eq("status", "accepted")
		)
		.collect();

	const friendIds: Id<"users">[] = [];
	for (const f of asRequester) {
		friendIds.push(f.addresseeId);
	}
	for (const f of asAddressee) {
		friendIds.push(f.requesterId);
	}
	return friendIds;
}

/**
 * Check if two users are friends.
 */
export async function areFriends(
	ctx: QueryCtx | MutationCtx,
	userId1: Id<"users">,
	userId2: Id<"users">
): Promise<boolean> {
	// Check userId1 → userId2
	const forward = await ctx.db
		.query("friendships")
		.withIndex("by_requester_addressee", (q) =>
			q.eq("requesterId", userId1).eq("addresseeId", userId2)
		)
		.first();
	if (forward?.status === "accepted") return true;

	// Check userId2 → userId1
	const reverse = await ctx.db
		.query("friendships")
		.withIndex("by_requester_addressee", (q) =>
			q.eq("requesterId", userId2).eq("addresseeId", userId1)
		)
		.first();
	return reverse?.status === "accepted";
}
