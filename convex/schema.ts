import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Enum-like validators (replacing PostgreSQL pgEnum)
export const visibility = v.union(
	v.literal("private"),
	v.literal("friends"),
	v.literal("public")
);
export const friendshipStatus = v.union(
	v.literal("pending"),
	v.literal("accepted"),
	v.literal("rejected")
);
export const highlightDisplayFilter = v.union(
	v.literal("anyone"),
	v.literal("friends"),
	v.literal("me")
);
export const commentDisplayMode = v.union(
	v.literal("expanded"),
	v.literal("collapsed")
);
export const apiKeyScope = v.union(v.literal("read"), v.literal("write"));

export default defineSchema({
	// ──────────────────────────────────────────────
	// Users
	// Better-Auth manages core auth tables (sessions, accounts, verifications, passkeys)
	// via the component. We define the user table with our extended profile fields.
	// ──────────────────────────────────────────────
	users: defineTable({
		// Better-Auth core fields
		name: v.string(),
		email: v.string(),
		emailVerified: v.boolean(),
		image: v.optional(v.string()),
		// Profile fields
		username: v.optional(v.string()),
		bio: v.optional(v.string()),
		website: v.optional(v.string()),
		twitterHandle: v.optional(v.string()),
		githubHandle: v.optional(v.string()),
		// Privacy settings (who can see MY stuff)
		profileVisibility: v.optional(
			v.union(v.literal("private"), v.literal("friends"), v.literal("public"))
		),
		highlightsVisibility: v.optional(
			v.union(v.literal("private"), v.literal("friends"), v.literal("public"))
		),
		bookmarksVisibility: v.optional(
			v.union(v.literal("private"), v.literal("friends"), v.literal("public"))
		),
		// Display preferences (what I see when browsing)
		highlightDisplayFilter: v.optional(
			v.union(v.literal("anyone"), v.literal("friends"), v.literal("me"))
		),
		commentDisplayMode: v.optional(
			v.union(v.literal("expanded"), v.literal("collapsed"))
		),
		// Admin fields
		role: v.optional(v.string()),
		banned: v.optional(v.boolean()),
		banReason: v.optional(v.string()),
		banExpires: v.optional(v.float64()),
		// Timestamps (updatedAt tracked explicitly; _creationTime is automatic)
		updatedAt: v.optional(v.float64()),
	})
		.index("by_username", ["username"])
		.index("by_email", ["email"]),

	// ──────────────────────────────────────────────
	// Highlights
	// Text highlights on web pages with anchoring selector and visibility control
	// ──────────────────────────────────────────────
	highlights: defineTable({
		userId: v.id("users"),
		url: v.string(),
		urlHash: v.string(),
		// W3C Web Annotation selector (RangeSelector, TextPositionSelector, TextQuoteSelector)
		selector: v.any(),
		// Denormalized highlighted text for display/search
		text: v.string(),
		visibility: v.union(
			v.literal("private"),
			v.literal("friends"),
			v.literal("public")
		),
		// Denormalized content for FTS
		searchContent: v.optional(v.string()),
		// Import tracking for Curius migration
		importSource: v.optional(v.string()),
		externalId: v.optional(v.string()),
		importedAt: v.optional(v.float64()),
		updatedAt: v.optional(v.float64()),
	})
		.index("by_userId", ["userId"])
		.index("by_urlHash", ["urlHash"])
		.index("by_userId_urlHash", ["userId", "urlHash"])
		.index("by_visibility", ["visibility"])
		.index("by_importSource_externalId", ["importSource", "externalId"])
		.searchIndex("search_content", {
			searchField: "searchContent",
			filterFields: ["userId", "visibility", "urlHash"],
		}),

	// ──────────────────────────────────────────────
	// Bookmarks
	// Saved URLs with metadata for rich link previews
	// ──────────────────────────────────────────────
	bookmarks: defineTable({
		userId: v.id("users"),
		url: v.string(),
		urlHash: v.string(),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		// Metadata for rich link previews
		favicon: v.optional(v.string()),
		ogImage: v.optional(v.string()),
		ogDescription: v.optional(v.string()),
		siteName: v.optional(v.string()),
		// Denormalized content for FTS
		searchContent: v.optional(v.string()),
	})
		.index("by_userId", ["userId"])
		.index("by_urlHash", ["urlHash"])
		.index("by_userId_urlHash", ["userId", "urlHash"])
		.searchIndex("search_content", {
			searchField: "searchContent",
			filterFields: ["userId"],
		}),

	// ──────────────────────────────────────────────
	// Comments (marginalia)
	// Threaded comments on highlights with soft delete and @mentions
	// ──────────────────────────────────────────────
	comments: defineTable({
		highlightId: v.id("highlights"),
		authorId: v.id("users"),
		// Parent comment ID for threading (absent = top-level)
		parentId: v.optional(v.id("comments")),
		// Markdown content
		content: v.string(),
		// Soft delete
		deletedAt: v.optional(v.float64()),
		// Denormalized content for FTS
		searchContent: v.optional(v.string()),
		updatedAt: v.optional(v.float64()),
	})
		.index("by_highlightId", ["highlightId"])
		.index("by_authorId", ["authorId"])
		.index("by_parentId", ["parentId"])
		.searchIndex("search_content", {
			searchField: "searchContent",
			filterFields: ["authorId"],
		}),

	// ──────────────────────────────────────────────
	// Comment mentions
	// Tracks @mentions in comments for notifications/filtering
	// ──────────────────────────────────────────────
	commentMentions: defineTable({
		commentId: v.id("comments"),
		mentionedUserId: v.id("users"),
	})
		.index("by_commentId", ["commentId"])
		.index("by_mentionedUserId", ["mentionedUserId"]),

	// ──────────────────────────────────────────────
	// Friendships
	// Directed friendship pairs with status tracking
	// ──────────────────────────────────────────────
	friendships: defineTable({
		requesterId: v.id("users"),
		addresseeId: v.id("users"),
		status: v.union(
			v.literal("pending"),
			v.literal("accepted"),
			v.literal("rejected")
		),
		updatedAt: v.optional(v.float64()),
	})
		.index("by_requesterId", ["requesterId"])
		.index("by_addresseeId", ["addresseeId"])
		.index("by_requesterId_status", ["requesterId", "status"])
		.index("by_addresseeId_status", ["addresseeId", "status"])
		.index("by_requester_addressee", ["requesterId", "addresseeId"]),

	// ──────────────────────────────────────────────
	// Tags
	// User-scoped tags for organizing bookmarks
	// System tags (favorites, to-read) are auto-created and protected
	// ──────────────────────────────────────────────
	tags: defineTable({
		userId: v.id("users"),
		name: v.string(),
		color: v.optional(v.string()),
		isSystem: v.boolean(),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_name", ["userId", "name"])
		.index("by_userId_isSystem", ["userId", "isSystem"]),

	// ──────────────────────────────────────────────
	// Bookmark tags (junction table)
	// Many-to-many linking bookmarks to tags
	// ──────────────────────────────────────────────
	bookmarkTags: defineTable({
		bookmarkId: v.id("bookmarks"),
		tagId: v.id("tags"),
	})
		.index("by_bookmarkId", ["bookmarkId"])
		.index("by_tagId", ["tagId"])
		.index("by_bookmark_tag", ["bookmarkId", "tagId"]),

	// ──────────────────────────────────────────────
	// API keys
	// For programmatic access (CLI, MCP server)
	// ──────────────────────────────────────────────
	apiKeys: defineTable({
		userId: v.id("users"),
		name: v.string(),
		keyHash: v.string(),
		keyPrefix: v.string(),
		scope: v.union(v.literal("read"), v.literal("write")),
		lastUsedAt: v.optional(v.float64()),
		expiresAt: v.optional(v.float64()),
		revoked: v.boolean(),
	})
		.index("by_userId", ["userId"])
		.index("by_keyHash", ["keyHash"]),

	// ──────────────────────────────────────────────
	// Curius integration
	// Legacy highlight import from Curius
	// ──────────────────────────────────────────────
	curiusCredentials: defineTable({
		userId: v.id("users"),
		token: v.string(),
		curiusUserId: v.optional(v.string()),
		curiusUsername: v.optional(v.string()),
		lastVerifiedAt: v.optional(v.float64()),
		updatedAt: v.optional(v.float64()),
	}).index("by_userId", ["userId"]),

	curiusUserMappings: defineTable({
		curiusUserId: v.string(),
		curiusUsername: v.string(),
		glossUserId: v.optional(v.id("users")),
		firstName: v.string(),
		lastName: v.string(),
		updatedAt: v.optional(v.float64()),
	})
		.index("by_curiusUserId", ["curiusUserId"])
		.index("by_glossUserId", ["glossUserId"]),

	// ──────────────────────────────────────────────
	// CLI auth pending (for OAuth + PKCE flow)
	// Temporary table for in-flight CLI auth sessions
	// ──────────────────────────────────────────────
	cliAuthPending: defineTable({
		codeChallenge: v.string(),
		redirectUri: v.string(),
		state: v.string(),
		authCode: v.optional(v.string()),
		userId: v.optional(v.id("users")),
		expiresAt: v.float64(),
	}).index("by_state", ["state"]),
});
