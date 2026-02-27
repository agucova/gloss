import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";

export const sendRequest = mutation({
	args: { addresseeId: v.id("users") },
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		if (userId === args.addresseeId) throw new Error("Cannot friend yourself");

		// Check target exists
		const target = await ctx.db.get(args.addresseeId);
		if (!target) throw new Error("User not found");

		// Check for existing friendship in this direction
		const existing = await ctx.db
			.query("friendships")
			.withIndex("by_requester_addressee", (q) =>
				q.eq("requesterId", userId).eq("addresseeId", args.addresseeId)
			)
			.first();

		if (existing) {
			if (existing.status === "accepted") throw new Error("Already friends");
			if (existing.status === "pending")
				throw new Error("Friend request already sent");
			// If rejected, allow re-request by updating
			if (existing.status === "rejected") {
				await ctx.db.patch(existing._id, {
					status: "pending",
					updatedAt: Date.now(),
				});
				return existing._id;
			}
		}

		// Check for reverse pending request (auto-accept)
		const reverse = await ctx.db
			.query("friendships")
			.withIndex("by_requester_addressee", (q) =>
				q.eq("requesterId", args.addresseeId).eq("addresseeId", userId)
			)
			.first();

		if (reverse?.status === "pending") {
			// Auto-accept: they already requested us
			await ctx.db.patch(reverse._id, {
				status: "accepted",
				updatedAt: Date.now(),
			});
			return reverse._id;
		}

		const id = await ctx.db.insert("friendships", {
			requesterId: userId,
			addresseeId: args.addresseeId,
			status: "pending",
		});
		return id;
	},
});

export const accept = mutation({
	args: { id: v.id("friendships") },
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const friendship = await ctx.db.get(args.id);
		if (!friendship) throw new Error("Friendship not found");
		if (friendship.addresseeId !== userId) throw new Error("Not authorized");
		if (friendship.status !== "pending")
			throw new Error("Request is not pending");

		await ctx.db.patch(args.id, {
			status: "accepted",
			updatedAt: Date.now(),
		});
		return { success: true };
	},
});

export const reject = mutation({
	args: { id: v.id("friendships") },
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);
		const friendship = await ctx.db.get(args.id);
		if (!friendship) throw new Error("Friendship not found");
		if (friendship.addresseeId !== userId) throw new Error("Not authorized");

		await ctx.db.patch(args.id, {
			status: "rejected",
			updatedAt: Date.now(),
		});
		return { success: true };
	},
});

export const removeFriend = mutation({
	args: { targetUserId: v.id("users") },
	handler: async (ctx, args) => {
		const { userId } = await requireAuth(ctx);

		// Check both directions
		const forward = await ctx.db
			.query("friendships")
			.withIndex("by_requester_addressee", (q) =>
				q.eq("requesterId", userId).eq("addresseeId", args.targetUserId)
			)
			.first();
		if (forward) {
			await ctx.db.delete(forward._id);
			return { success: true };
		}

		const reverse = await ctx.db
			.query("friendships")
			.withIndex("by_requester_addressee", (q) =>
				q.eq("requesterId", args.targetUserId).eq("addresseeId", userId)
			)
			.first();
		if (reverse) {
			await ctx.db.delete(reverse._id);
			return { success: true };
		}

		throw new Error("Friendship not found");
	},
});

export const listFriends = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return [];

		// Find the user by their token identifier
		const user = await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", identity.email!))
			.first();
		if (!user) return [];

		const asRequester = await ctx.db
			.query("friendships")
			.withIndex("by_requesterId_status", (q) =>
				q.eq("requesterId", user._id).eq("status", "accepted")
			)
			.collect();

		const asAddressee = await ctx.db
			.query("friendships")
			.withIndex("by_addresseeId_status", (q) =>
				q.eq("addresseeId", user._id).eq("status", "accepted")
			)
			.collect();

		const friendIds = [
			...asRequester.map((f) => f.addresseeId),
			...asAddressee.map((f) => f.requesterId),
		];

		const friends = await Promise.all(friendIds.map((id) => ctx.db.get(id)));
		return friends.filter(Boolean).map((f) => ({
			_id: f!._id,
			name: f!.name,
			image: f!.image,
			username: f!.username,
		}));
	},
});

export const listPending = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return [];

		const user = await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", identity.email!))
			.first();
		if (!user) return [];

		const pending = await ctx.db
			.query("friendships")
			.withIndex("by_addresseeId_status", (q) =>
				q.eq("addresseeId", user._id).eq("status", "pending")
			)
			.collect();

		return Promise.all(
			pending.map(async (f) => {
				const requester = await ctx.db.get(f.requesterId);
				return {
					...f,
					requester: requester
						? {
								_id: requester._id,
								name: requester.name,
								image: requester.image,
								username: requester.username,
							}
						: null,
				};
			})
		);
	},
});

export const listSent = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return [];

		const user = await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", identity.email!))
			.first();
		if (!user) return [];

		const sent = await ctx.db
			.query("friendships")
			.withIndex("by_requesterId_status", (q) =>
				q.eq("requesterId", user._id).eq("status", "pending")
			)
			.collect();

		return Promise.all(
			sent.map(async (f) => {
				const addressee = await ctx.db.get(f.addresseeId);
				return {
					...f,
					addressee: addressee
						? {
								_id: addressee._id,
								name: addressee.name,
								image: addressee.image,
								username: addressee.username,
							}
						: null,
				};
			})
		);
	},
});

export const searchFriends = query({
	args: { q: v.string() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return [];

		const user = await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", identity.email!))
			.first();
		if (!user) return [];

		const { getFriendIds } = await import("./lib/friends");
		const friendIds = await getFriendIds(ctx, user._id);

		const friends = await Promise.all(friendIds.map((id) => ctx.db.get(id)));
		const query = args.q.toLowerCase();

		return friends
			.filter(Boolean)
			.filter(
				(f) =>
					f!.name.toLowerCase().includes(query) ||
					(f!.username && f!.username.toLowerCase().includes(query))
			)
			.slice(0, 10)
			.map((f) => ({
				_id: f!._id,
				name: f!.name,
				image: f!.image,
				username: f!.username,
			}));
	},
});
