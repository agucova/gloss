import { t } from "elysia";

/**
 * XPath-based range selector for precise DOM positioning.
 */
export const RangeSelectorSchema = t.Object({
	type: t.Literal("RangeSelector"),
	startContainer: t.String(),
	startOffset: t.Number(),
	endContainer: t.String(),
	endOffset: t.Number(),
});

/**
 * Character position selector based on textContent offsets.
 */
export const TextPositionSelectorSchema = t.Object({
	type: t.Literal("TextPositionSelector"),
	start: t.Number(),
	end: t.Number(),
});

/**
 * Text quote selector with surrounding context.
 */
export const TextQuoteSelectorSchema = t.Object({
	type: t.Literal("TextQuoteSelector"),
	exact: t.String(),
	prefix: t.String(),
	suffix: t.String(),
});

/**
 * Composite selector containing all three selector types for maximum resilience.
 * Matches @gloss/anchoring AnnotationSelector type.
 */
export const SelectorSchema = t.Object({
	range: RangeSelectorSchema,
	position: TextPositionSelectorSchema,
	quote: TextQuoteSelectorSchema,
});

/**
 * Visibility options for highlights.
 */
export const VisibilitySchema = t.Union([
	t.Literal("private"),
	t.Literal("friends"),
	t.Literal("public"),
]);

/**
 * Cursor-based pagination schema with optional search query.
 */
export const CursorPaginationSchema = t.Object({
	cursor: t.Optional(t.String()),
	limit: t.Number({ minimum: 1, maximum: 100, default: 20 }),
	q: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
	tagId: t.Optional(t.String()),
	order: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
});

/**
 * Schema for creating a new highlight.
 */
export const CreateHighlightSchema = t.Object({
	url: t.String({ format: "uri" }),
	selector: SelectorSchema,
	text: t.String({ minLength: 1 }),
	visibility: t.Optional(VisibilitySchema),
});

/**
 * Schema for updating an existing highlight.
 */
export const UpdateHighlightSchema = t.Object({
	visibility: t.Optional(VisibilitySchema),
});

/**
 * Schema for creating a bookmark.
 */
export const CreateBookmarkSchema = t.Object({
	url: t.String({ format: "uri" }),
	title: t.Optional(t.String()),
	description: t.Optional(t.String()),
	// Metadata for rich link previews
	favicon: t.Optional(t.String()),
	ogImage: t.Optional(t.String()),
	ogDescription: t.Optional(t.String()),
	siteName: t.Optional(t.String()),
	// Tags for categorization
	tags: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 50 }))),
});

/**
 * Schema for updating a bookmark.
 */
export const UpdateBookmarkSchema = t.Object({
	title: t.Optional(t.String()),
	description: t.Optional(t.String()),
	tags: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 50 }))),
});

/**
 * Schema for sending a friend request.
 */
export const FriendRequestSchema = t.Object({
	userId: t.String({ minLength: 1 }),
});

/**
 * Schema for setting/updating username.
 * Usernames: 3–20 chars, alphanumeric + underscores, case-insensitive.
 */
export const SetUsernameSchema = t.Object({
	username: t.String({
		minLength: 3,
		maxLength: 20,
		pattern: "^[a-zA-Z0-9_]+$",
	}),
});

/**
 * Schema for updating user profile.
 */
export const UpdateUserProfileSchema = t.Object({
	name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
	bio: t.Optional(t.String({ maxLength: 280 })),
	website: t.Optional(t.Union([t.String({ format: "uri" }), t.Literal("")])),
	twitterHandle: t.Optional(
		t.Union([t.String({ pattern: "^[a-zA-Z0-9_]{0,15}$" }), t.Literal("")])
	),
	githubHandle: t.Optional(
		t.Union([t.String({ pattern: "^[a-zA-Z0-9-]{0,39}$" }), t.Literal("")])
	),
	bookmarksVisibility: t.Optional(VisibilitySchema),
});

/**
 * Friendship status for profile views.
 */
export const FriendshipStatusSchema = t.Union([
	t.Literal("none"),
	t.Literal("pending_sent"),
	t.Literal("pending_received"),
	t.Literal("friends"),
]);

/**
 * Highlight display filter options (whose highlights to show when browsing).
 */
export const HighlightDisplayFilterSchema = t.Union([
	t.Literal("anyone"),
	t.Literal("friends"),
	t.Literal("me"),
]);

/**
 * Comment display mode options.
 */
export const CommentDisplayModeSchema = t.Union([
	t.Literal("expanded"),
	t.Literal("collapsed"),
]);

/**
 * Schema for updating user settings.
 */
export const UpdateUserSettingsSchema = t.Object({
	profileVisibility: t.Optional(VisibilitySchema),
	highlightsVisibility: t.Optional(VisibilitySchema),
	bookmarksVisibility: t.Optional(VisibilitySchema),
	highlightDisplayFilter: t.Optional(HighlightDisplayFilterSchema),
	commentDisplayMode: t.Optional(CommentDisplayModeSchema),
});
