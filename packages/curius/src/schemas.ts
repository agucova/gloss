import { z } from "zod";

// ============================================================================
// Core Schemas
// ============================================================================

/**
 * Curius user profile schema
 */
export const curiusUserSchema = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	userLink: z.string(), // Profile URL slug
	twitter: z.string().optional(),
	website: z.string().optional(),
	createdDate: z.string().optional(),
});

/**
 * Highlight position for text-based matching
 */
export const highlightPositionSchema = z.object({
	rawHighlight: z.string(),
	leftContext: z.string(),
	rightContext: z.string(),
});

/**
 * A highlight on a saved link
 */
export const curiusHighlightSchema = z.object({
	id: z.string(),
	linkId: z.string().optional(),
	highlight: z.string(), // The highlighted text (alias for rawHighlight in some responses)
	highlightText: z.string().optional(), // Alternative field name
	position: highlightPositionSchema.optional(),
	userId: z.string().optional(),
	createdAt: z.string().optional(),
});

/**
 * A saved link/bookmark
 */
export const curiusLinkSchema = z.object({
	id: z.string(),
	url: z.string(),
	link: z.string().optional(), // Sometimes URL is in 'link' field
	title: z.string().optional(),
	description: z.string().optional(),
	imageUrl: z.string().optional(),
	highlights: z.array(curiusHighlightSchema).default([]),
	nHighlights: z.number().default(0),
	favorite: z.boolean().optional(),
	toRead: z.boolean().optional(),
	createdAt: z.string().optional(),
	modifiedDate: z.string().optional(),
});

/**
 * User info attached to network highlights
 */
export const networkUserSchema = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	userLink: z.string(),
});

/**
 * A highlight from a friend (includes user info)
 */
export const networkHighlightSchema = curiusHighlightSchema.extend({
	user: networkUserSchema.optional(),
});

/**
 * Network link response (friend's saved link with highlights)
 */
export const networkLinkSchema = z.object({
	id: z.string(),
	url: z.string().optional(),
	link: z.string().optional(),
	title: z.string().optional(),
	highlights: z.array(networkHighlightSchema).default([]),
	user: networkUserSchema,
});

// ============================================================================
// API Response Schemas
// ============================================================================

export const getUserResponseSchema = curiusUserSchema;

export const getFollowingResponseSchema = z.object({
	following: z.array(curiusUserSchema),
});

export const getLinkByUrlResponseSchema = curiusLinkSchema.nullable();

export const getNetworkLinksResponseSchema = z.array(networkLinkSchema);

export const addLinkResponseSchema = curiusLinkSchema;

export const addHighlightResponseSchema = curiusHighlightSchema;

// ============================================================================
// Input Schemas (for tRPC procedures)
// ============================================================================

export const connectCuriusInputSchema = z.object({
	token: z.string().min(1, "Token is required"),
});

export const getLinkByUrlInputSchema = z.object({
	url: z.string().url("Invalid URL"),
});

export const getNetworkHighlightsInputSchema = z.object({
	url: z.string().url("Invalid URL"),
});

export const addLinkInputSchema = z.object({
	url: z.string().url("Invalid URL"),
	title: z.string().optional(),
});

export const addHighlightInputSchema = z.object({
	linkId: z.string(),
	position: highlightPositionSchema,
	note: z.string().optional(),
});

export const deleteHighlightInputSchema = z.object({
	linkId: z.string(),
	highlightText: z.string(),
});
