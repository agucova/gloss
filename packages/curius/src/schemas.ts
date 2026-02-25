import { z } from "zod";

// ============================================================================
// Core Schemas
// ============================================================================

/**
 * Curius user profile schema
 */
export const curiusUserSchema = z.object({
	id: z.union([z.string(), z.number()]).transform(String),
	firstName: z.string(),
	lastName: z.string(),
	userLink: z.string(), // Profile URL slug
	twitter: z.string().nullable().optional(),
	website: z.string().nullable().optional(),
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
	id: z.union([z.string(), z.number()]).transform(String),
	linkId: z.union([z.string(), z.number()]).transform(String).optional(),
	highlight: z.string(), // The highlighted text (alias for rawHighlight in some responses)
	highlightText: z.string().optional(), // Alternative field name
	rawHighlight: z.string().optional(),
	leftContext: z.string().optional(),
	rightContext: z.string().optional(),
	position: highlightPositionSchema.optional(),
	userId: z.union([z.string(), z.number()]).transform(String).optional(),
	createdAt: z.string().optional(),
	createdDate: z.string().optional(),
});

/**
 * A saved link/bookmark
 */
export const curiusLinkSchema = z.object({
	id: z.union([z.string(), z.number()]).transform(String),
	url: z.string().optional(),
	link: z.string().optional(), // Sometimes URL is in 'link' field
	title: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	imageUrl: z.string().nullable().optional(),
	highlights: z.array(curiusHighlightSchema).default([]),
	nHighlights: z.number().default(0),
	favorite: z.boolean().nullable().optional(),
	toRead: z.boolean().nullable().optional(),
	createdAt: z.string().optional(),
	createdDate: z.string().optional(),
	modifiedDate: z.string().optional(),
});

/**
 * User info attached to network highlights
 */
export const networkUserSchema = z.object({
	id: z.union([z.string(), z.number()]).transform(String),
	firstName: z.string(),
	lastName: z.string(),
	userLink: z.string(),
	lastOnline: z.string().optional(),
});

/**
 * A highlight from a friend (includes user info) - from network endpoint
 */
export const networkHighlightSchema = z.object({
	id: z.union([z.string(), z.number()]).transform(String),
	userId: z.union([z.string(), z.number()]).transform(String),
	linkId: z.union([z.string(), z.number()]).transform(String),
	highlight: z.string(),
	rawHighlight: z.string().optional(),
	leftContext: z.string().optional(),
	rightContext: z.string().optional(),
	position: highlightPositionSchema.nullable().optional(),
	verified: z.boolean().nullable().optional(),
	createdDate: z.string().optional(),
	user: networkUserSchema.optional(),
	comment: z.unknown().nullable().optional(),
	mentions: z.array(z.unknown()).optional(),
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

export const getUserResponseSchema = z.object({
	user: curiusUserSchema,
});

export const getFollowingResponseSchema = z.object({
	following: z.array(curiusUserSchema),
});

export const getLinkByUrlResponseSchema = z.object({
	link: curiusLinkSchema.nullable(),
});

/**
 * User info in network info response (with online/saved dates)
 */
export const networkInfoUserSchema = z.object({
	id: z.union([z.string(), z.number()]).transform(String),
	firstName: z.string(),
	lastName: z.string(),
	userLink: z.string(),
	lastOnline: z.string().optional(),
	savedDate: z.string().optional(),
});

// Network info response from /api/links/url/network
export const networkInfoSchema = z.object({
	id: z.union([z.string(), z.number()]).transform(String),
	link: z.string(),
	title: z.string().nullable().optional(),
	favorite: z.boolean().optional(),
	snippet: z.string().nullable().optional(),
	metadata: z.string().nullable().optional(),
	createdDate: z.string().nullable().optional(),
	modifiedDate: z.string().nullable().optional(),
	lastCrawled: z.string().nullable().optional(),
	userIds: z.array(z.number()).optional(),
	users: z.array(networkInfoUserSchema).default([]),
	highlights: z.array(z.array(networkHighlightSchema)).default([]),
	readCount: z.number().optional(),
});

export const getNetworkLinksResponseSchema = z.object({
	networkInfo: networkInfoSchema,
});

export const addLinkResponseSchema = z.object({
	link: curiusLinkSchema,
});

export const addHighlightResponseSchema = curiusHighlightSchema;

/**
 * Response from GET /api/users/:id/links (user's own links).
 * Returns {userSaved: [...]} with links and their highlights.
 */
export const getUserLinksResponseSchema = z.object({
	userSaved: z.array(curiusLinkSchema),
});

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
