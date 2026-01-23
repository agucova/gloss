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
