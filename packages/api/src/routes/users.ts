import { auth } from "@gloss/auth";
import { db } from "@gloss/db";
import {
	bookmark,
	bookmarkTag,
	friendship,
	highlight,
	tag,
	user,
} from "@gloss/db/schema";
import { and, count, desc, eq, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { getFriendIds } from "../lib/friends";
import {
	CursorPaginationSchema,
	SetUsernameSchema,
	UpdateUserProfileSchema,
	UpdateUserSettingsSchema,
} from "../models";

/**
 * Get friendship status between current user and target user.
 */
async function getFriendshipStatus(
	currentUserId: string,
	targetUserId: string
): Promise<"none" | "pending_sent" | "pending_received" | "friends"> {
	if (currentUserId === targetUserId) {
		return "none";
	}

	const friendshipRecord = await db.query.friendship.findFirst({
		where: or(
			and(
				eq(friendship.requesterId, currentUserId),
				eq(friendship.addresseeId, targetUserId)
			),
			and(
				eq(friendship.requesterId, targetUserId),
				eq(friendship.addresseeId, currentUserId)
			)
		),
	});

	if (!friendshipRecord) {
		return "none";
	}
	if (friendshipRecord.status === "rejected") {
		return "none";
	}
	if (friendshipRecord.status === "accepted") {
		return "friends";
	}
	if (friendshipRecord.requesterId === currentUserId) {
		return "pending_sent";
	}
	return "pending_received";
}

/**
 * Users routes for profile management.
 */
export const users = new Elysia({ prefix: "/users" })
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return { session };
	})

	// Check if username is available
	.get(
		"/check-username/:username",
		async ({ params }) => {
			const normalizedUsername = params.username.toLowerCase();
			const existing = await db.query.user.findFirst({
				where: ilike(user.username, normalizedUsername),
				columns: { id: true },
			});
			return { available: !existing };
		},
		{
			params: t.Object({
				username: t.String({ minLength: 1 }),
			}),
		}
	)

	// Get current user's profile
	.get("/me", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const profile = await db.query.user.findFirst({
			where: eq(user.id, session.user.id),
			columns: {
				id: true,
				name: true,
				email: true,
				image: true,
				username: true,
				bio: true,
				website: true,
				twitterHandle: true,
				githubHandle: true,
				bookmarksVisibility: true,
				createdAt: true,
			},
		});

		if (!profile) {
			set.status = 404;
			return { error: "User not found" };
		}

		// Get counts
		const [highlightCount, bookmarkCount, friendCount] = await Promise.all([
			db
				.select({ count: count() })
				.from(highlight)
				.where(eq(highlight.userId, session.user.id))
				.then((r) => r[0]?.count ?? 0),
			db
				.select({ count: count() })
				.from(bookmark)
				.where(eq(bookmark.userId, session.user.id))
				.then((r) => r[0]?.count ?? 0),
			getFriendIds(session.user.id).then((ids) => ids.length),
		]);

		return {
			...profile,
			highlightCount,
			bookmarkCount,
			friendCount,
		};
	})

	// Update current user's profile
	.patch(
		"/me",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const updateData: Record<string, unknown> = {};

			if (body.name !== undefined) {
				updateData.name = body.name;
			}
			if (body.bio !== undefined) {
				updateData.bio = body.bio || null;
			}
			if (body.website !== undefined) {
				updateData.website = body.website || null;
			}
			if (body.twitterHandle !== undefined) {
				updateData.twitterHandle = body.twitterHandle || null;
			}
			if (body.githubHandle !== undefined) {
				updateData.githubHandle = body.githubHandle || null;
			}
			if (body.bookmarksVisibility !== undefined) {
				updateData.bookmarksVisibility = body.bookmarksVisibility;
			}

			if (Object.keys(updateData).length === 0) {
				set.status = 400;
				return { error: "No fields to update" };
			}

			const updated = await db
				.update(user)
				.set(updateData)
				.where(eq(user.id, session.user.id))
				.returning({
					id: user.id,
					name: user.name,
					image: user.image,
					username: user.username,
					bio: user.bio,
					website: user.website,
					twitterHandle: user.twitterHandle,
					githubHandle: user.githubHandle,
					bookmarksVisibility: user.bookmarksVisibility,
				});

			return updated[0];
		},
		{
			body: UpdateUserProfileSchema,
		}
	)

	// Get current user's settings
	.get("/me/settings", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const settings = await db.query.user.findFirst({
			where: eq(user.id, session.user.id),
			columns: {
				profileVisibility: true,
				highlightsVisibility: true,
				bookmarksVisibility: true,
				highlightDisplayFilter: true,
				commentDisplayMode: true,
			},
		});

		if (!settings) {
			set.status = 404;
			return { error: "User not found" };
		}

		return settings;
	})

	// Update current user's settings
	.patch(
		"/me/settings",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const updateData: Record<string, unknown> = {};

			if (body.profileVisibility !== undefined) {
				updateData.profileVisibility = body.profileVisibility;
			}
			if (body.highlightsVisibility !== undefined) {
				updateData.highlightsVisibility = body.highlightsVisibility;
			}
			if (body.bookmarksVisibility !== undefined) {
				updateData.bookmarksVisibility = body.bookmarksVisibility;
			}
			if (body.highlightDisplayFilter !== undefined) {
				updateData.highlightDisplayFilter = body.highlightDisplayFilter;
			}
			if (body.commentDisplayMode !== undefined) {
				updateData.commentDisplayMode = body.commentDisplayMode;
			}

			if (Object.keys(updateData).length === 0) {
				set.status = 400;
				return { error: "No fields to update" };
			}

			const updated = await db
				.update(user)
				.set(updateData)
				.where(eq(user.id, session.user.id))
				.returning({
					profileVisibility: user.profileVisibility,
					highlightsVisibility: user.highlightsVisibility,
					bookmarksVisibility: user.bookmarksVisibility,
					highlightDisplayFilter: user.highlightDisplayFilter,
					commentDisplayMode: user.commentDisplayMode,
				});

			return updated[0];
		},
		{
			body: UpdateUserSettingsSchema,
		}
	)

	// Set or change username
	.put(
		"/me/username",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const normalizedUsername = body.username.toLowerCase();

			// Check if username is already taken by another user (case-insensitive)
			const takenByOther = await db.query.user.findFirst({
				where: ilike(user.username, normalizedUsername),
				columns: { id: true },
			});

			if (takenByOther && takenByOther.id !== session.user.id) {
				set.status = 409;
				return { error: "Username already taken" };
			}

			const updated = await db
				.update(user)
				.set({ username: normalizedUsername })
				.where(eq(user.id, session.user.id))
				.returning({
					id: user.id,
					username: user.username,
				});

			return updated[0];
		},
		{
			body: SetUsernameSchema,
		}
	)

	// Get user profile by username
	.get(
		"/by-username/:username",
		async ({ params, session, set }) => {
			const targetUser = await db.query.user.findFirst({
				where: ilike(user.username, params.username.toLowerCase()),
				columns: {
					id: true,
					name: true,
					image: true,
					username: true,
					bio: true,
					website: true,
					twitterHandle: true,
					githubHandle: true,
					bookmarksVisibility: true,
					createdAt: true,
				},
			});

			if (!targetUser) {
				set.status = 404;
				return { error: "User not found" };
			}

			// Get counts (public highlights only for non-self, non-friends)
			const isOwnProfile = session?.user.id === targetUser.id;
			const friendshipStatus = session
				? await getFriendshipStatus(session.user.id, targetUser.id)
				: "none";
			const isFriend = friendshipStatus === "friends";

			// Highlight count based on visibility
			const highlightCountQuery = (() => {
				if (isOwnProfile) {
					return db
						.select({ count: count() })
						.from(highlight)
						.where(eq(highlight.userId, targetUser.id));
				}
				if (isFriend) {
					return db
						.select({ count: count() })
						.from(highlight)
						.where(
							and(
								eq(highlight.userId, targetUser.id),
								or(
									eq(highlight.visibility, "public"),
									eq(highlight.visibility, "friends")
								)
							)
						);
				}
				return db
					.select({ count: count() })
					.from(highlight)
					.where(
						and(
							eq(highlight.userId, targetUser.id),
							eq(highlight.visibility, "public")
						)
					);
			})();

			// Bookmark count based on user's privacy setting
			const bookmarkCountQuery = (() => {
				if (isOwnProfile) {
					return db
						.select({ count: count() })
						.from(bookmark)
						.where(eq(bookmark.userId, targetUser.id));
				}
				if (
					targetUser.bookmarksVisibility === "public" ||
					(targetUser.bookmarksVisibility === "friends" && isFriend)
				) {
					return db
						.select({ count: count() })
						.from(bookmark)
						.where(eq(bookmark.userId, targetUser.id));
				}
				return Promise.resolve([{ count: 0 }]);
			})();

			const [highlightCount, bookmarkCount, friendCount] = await Promise.all([
				highlightCountQuery.then((r) => r[0]?.count ?? 0),
				bookmarkCountQuery.then((r) => r[0]?.count ?? 0),
				getFriendIds(targetUser.id).then((ids) => ids.length),
			]);

			return {
				...targetUser,
				highlightCount,
				bookmarkCount,
				friendCount,
				friendshipStatus: session ? friendshipStatus : undefined,
				isOwnProfile,
			};
		},
		{
			params: t.Object({
				username: t.String({ minLength: 1 }),
			}),
		}
	)

	// Get user's highlights (visibility-filtered)
	.get(
		"/:userId/highlights",
		async ({ params, query, session, set }) => {
			const targetUser = await db.query.user.findFirst({
				where: eq(user.id, params.userId),
				columns: { id: true },
			});

			if (!targetUser) {
				set.status = 404;
				return { error: "User not found" };
			}

			const isOwnProfile = session?.user.id === params.userId;
			const friendIds = session ? await getFriendIds(session.user.id) : [];
			const isFriend = friendIds.includes(params.userId);

			// Build visibility filter
			const visibilityFilter = (() => {
				if (isOwnProfile) {
					return eq(highlight.userId, params.userId);
				}
				if (isFriend) {
					return and(
						eq(highlight.userId, params.userId),
						or(
							eq(highlight.visibility, "public"),
							eq(highlight.visibility, "friends")
						)
					);
				}
				return and(
					eq(highlight.userId, params.userId),
					eq(highlight.visibility, "public")
				);
			})();

			// Add search filter if query provided
			const searchFilter = query.q
				? ilike(highlight.text, `%${query.q}%`)
				: undefined;

			// Combine filters
			const baseFilter = searchFilter
				? and(visibilityFilter, searchFilter)
				: visibilityFilter;

			const limit = query.limit ?? 20;
			const cursorFilter = query.cursor
				? lt(highlight.createdAt, new Date(query.cursor))
				: undefined;

			const results = await db.query.highlight.findMany({
				where: cursorFilter ? and(baseFilter, cursorFilter) : baseFilter,
				orderBy: [desc(highlight.createdAt)],
				limit: limit + 1,
			});

			const hasMore = results.length > limit;
			const items = hasMore ? results.slice(0, -1) : results;
			const nextCursor = hasMore ? items.at(-1)?.createdAt.toISOString() : null;

			return { items, nextCursor };
		},
		{
			params: t.Object({ userId: t.String() }),
			query: CursorPaginationSchema,
		}
	)

	// Get user's bookmarks (respects privacy setting)
	.get(
		"/:userId/bookmarks",
		async ({ params, query, session, set }) => {
			const targetUser = await db.query.user.findFirst({
				where: eq(user.id, params.userId),
				columns: { id: true, bookmarksVisibility: true },
			});

			if (!targetUser) {
				set.status = 404;
				return { error: "User not found" };
			}

			const isOwnProfile = session?.user.id === params.userId;
			const friendIds = session ? await getFriendIds(session.user.id) : [];
			const isFriend = friendIds.includes(params.userId);

			// Check visibility permission
			if (!isOwnProfile) {
				if (targetUser.bookmarksVisibility === "private") {
					return { items: [], nextCursor: null };
				}
				if (targetUser.bookmarksVisibility === "friends" && !isFriend) {
					return { items: [], nextCursor: null };
				}
			}

			// Build base filter
			let userFilter = eq(bookmark.userId, params.userId);

			// Filter by tag if provided
			if (query.tagId) {
				const bookmarkIdsWithTag = await db
					.select({ bookmarkId: bookmarkTag.bookmarkId })
					.from(bookmarkTag)
					.where(eq(bookmarkTag.tagId, query.tagId));

				if (bookmarkIdsWithTag.length === 0) {
					return { items: [], nextCursor: null };
				}

				const ids = bookmarkIdsWithTag.map((b) => b.bookmarkId);
				userFilter = and(
					eq(bookmark.userId, params.userId),
					inArray(bookmark.id, ids)
				)!;
			}

			// Add search filter if query provided
			const searchFilter = query.q
				? or(
						ilike(bookmark.title, `%${query.q}%`),
						ilike(bookmark.description, `%${query.q}%`),
						ilike(bookmark.url, `%${query.q}%`)
					)
				: undefined;

			const baseFilter = searchFilter
				? and(userFilter, searchFilter)
				: userFilter;

			const limit = query.limit ?? 20;
			const cursorFilter = query.cursor
				? lt(bookmark.createdAt, new Date(query.cursor))
				: undefined;

			const results = await db.query.bookmark.findMany({
				where: cursorFilter ? and(baseFilter, cursorFilter) : baseFilter,
				orderBy: [desc(bookmark.createdAt)],
				limit: limit + 1,
				with: {
					bookmarkTags: {
						with: {
							tag: true,
						},
					},
				},
			});

			const hasMore = results.length > limit;
			const rawItems = hasMore ? results.slice(0, -1) : results;
			const nextCursor = hasMore
				? rawItems.at(-1)?.createdAt.toISOString()
				: null;

			// Transform items to flatten tags
			const items = rawItems.map((item) => ({
				...item,
				bookmarkTags: undefined,
				tags: item.bookmarkTags.map((bt) => ({
					id: bt.tag.id,
					name: bt.tag.name,
					color: bt.tag.color,
					isSystem: bt.tag.isSystem,
				})),
			}));

			return { items, nextCursor };
		},
		{
			params: t.Object({ userId: t.String() }),
			query: CursorPaginationSchema,
		}
	)

	// Get user's tags (for filtering bookmarks)
	.get(
		"/:userId/tags",
		async ({ params, session, set }) => {
			const targetUser = await db.query.user.findFirst({
				where: eq(user.id, params.userId),
				columns: { id: true, bookmarksVisibility: true },
			});

			if (!targetUser) {
				set.status = 404;
				return { error: "User not found" };
			}

			const isOwnProfile = session?.user.id === params.userId;
			const friendIds = session ? await getFriendIds(session.user.id) : [];
			const isFriend = friendIds.includes(params.userId);

			// Check visibility permission (same as bookmarks)
			if (!isOwnProfile) {
				if (targetUser.bookmarksVisibility === "private") {
					return { tags: [] };
				}
				if (targetUser.bookmarksVisibility === "friends" && !isFriend) {
					return { tags: [] };
				}
			}

			// Get user's tags with bookmark counts
			const tagsWithCounts = await db
				.select({
					id: tag.id,
					name: tag.name,
					color: tag.color,
					isSystem: tag.isSystem,
					bookmarkCount: sql<number>`count(${bookmarkTag.id})::int`,
				})
				.from(tag)
				.leftJoin(bookmarkTag, eq(bookmarkTag.tagId, tag.id))
				.where(eq(tag.userId, params.userId))
				.groupBy(tag.id)
				.orderBy(desc(tag.isSystem), desc(sql`count(${bookmarkTag.id})`));

			// Only return tags that have at least one bookmark
			const tagsFiltered = tagsWithCounts.filter((t) => t.bookmarkCount > 0);

			return { tags: tagsFiltered };
		},
		{
			params: t.Object({ userId: t.String() }),
		}
	)

	// Get user's friends
	.get(
		"/:userId/friends",
		async ({ params, set }) => {
			const targetUser = await db.query.user.findFirst({
				where: eq(user.id, params.userId),
				columns: { id: true },
			});

			if (!targetUser) {
				set.status = 404;
				return { error: "User not found" };
			}

			const friendships = await db.query.friendship.findMany({
				where: and(
					eq(friendship.status, "accepted"),
					or(
						eq(friendship.requesterId, params.userId),
						eq(friendship.addresseeId, params.userId)
					)
				),
				with: {
					requester: {
						columns: { id: true, name: true, image: true, username: true },
					},
					addressee: {
						columns: { id: true, name: true, image: true, username: true },
					},
				},
			});

			// Extract the friend (the other user in each friendship)
			return friendships.map((f) =>
				f.requesterId === params.userId ? f.addressee : f.requester
			);
		},
		{
			params: t.Object({ userId: t.String() }),
		}
	);
