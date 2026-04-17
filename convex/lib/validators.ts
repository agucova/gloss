import { v } from "convex/values";

/**
 * W3C Web Annotation selector validator used on the `highlights` table.
 *
 * Mirrors `AnnotationSelector` in `packages/anchoring/src/types.ts` — keep
 * the two in sync. The `quote` selector is always present (it's text-based
 * and computable from any selection). `range` and `position` are only
 * captured when the highlight is created in-page; they're absent for
 * highlights imported from external sources (e.g. Curius) that only carry
 * text + context.
 */
export const selectorValidator = v.object({
	range: v.optional(
		v.object({
			type: v.literal("RangeSelector"),
			startContainer: v.string(),
			startOffset: v.number(),
			endContainer: v.string(),
			endOffset: v.number(),
		})
	),
	position: v.optional(
		v.object({
			type: v.literal("TextPositionSelector"),
			start: v.number(),
			end: v.number(),
		})
	),
	quote: v.object({
		type: v.literal("TextQuoteSelector"),
		exact: v.string(),
		prefix: v.string(),
		suffix: v.string(),
	}),
});
