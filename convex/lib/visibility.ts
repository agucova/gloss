import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

import { areFriends } from "./friends";

export type ProfileAccess = "full" | "none";

/**
 * Check whether a viewer can see a target user's profile / profile-scoped data.
 *
 * Rules:
 *   - own profile → full
 *   - target.profileVisibility === "public" (default) → full
 *   - target.profileVisibility === "friends" AND viewer is friend → full
 *   - otherwise → none
 *
 * Callers typically treat "none" as 404-equivalent: return null / empty page.
 */
export async function canViewProfile(
	ctx: QueryCtx | MutationCtx,
	viewerUserId: Id<"users"> | null,
	target: Doc<"users">
): Promise<ProfileAccess> {
	if (viewerUserId && viewerUserId === target._id) return "full";

	const visibility = target.profileVisibility ?? "public";

	if (visibility === "public") return "full";
	if (visibility === "private") return "none";

	// visibility === "friends"
	if (!viewerUserId) return "none";
	return (await areFriends(ctx, viewerUserId, target._id)) ? "full" : "none";
}
