import { t } from "elysia";

/**
 * Selector schema for highlight anchoring.
 * The exact format is TBD based on anchoring approach.
 * For now, we use a flexible object that can hold various selector types.
 */
export const SelectorSchema = t.Object({
	type: t.String(),
	// Additional fields depending on selector type
	exact: t.Optional(t.String()),
	prefix: t.Optional(t.String()),
	suffix: t.Optional(t.String()),
	// For range-based selectors
	start: t.Optional(t.Number()),
	end: t.Optional(t.Number()),
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
 * Cursor-based pagination schema.
 */
export const CursorPaginationSchema = t.Object({
	cursor: t.Optional(t.String()),
	limit: t.Number({ minimum: 1, maximum: 100, default: 20 }),
});

/**
 * Hex color code schema (e.g., #FFFF00).
 */
export const HighlightColorSchema = t.String({ pattern: "^#[0-9A-Fa-f]{6}$" });

/**
 * Schema for creating a new highlight.
 */
export const CreateHighlightSchema = t.Object({
	url: t.String({ format: "uri" }),
	selector: SelectorSchema,
	text: t.String({ minLength: 1 }),
	note: t.Optional(t.String()),
	color: t.Optional(HighlightColorSchema),
	visibility: t.Optional(VisibilitySchema),
});

/**
 * Schema for updating an existing highlight.
 */
export const UpdateHighlightSchema = t.Object({
	note: t.Optional(t.String()),
	color: t.Optional(HighlightColorSchema),
	visibility: t.Optional(VisibilitySchema),
});

/**
 * Schema for creating a bookmark.
 */
export const CreateBookmarkSchema = t.Object({
	url: t.String({ format: "uri" }),
	title: t.Optional(t.String()),
	description: t.Optional(t.String()),
});

/**
 * Schema for sending a friend request.
 */
export const FriendRequestSchema = t.Object({
	userId: t.String({ minLength: 1 }),
});
