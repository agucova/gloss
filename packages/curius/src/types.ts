import type { z } from "zod";

import type {
	curiusHighlightSchema,
	curiusLinkSchema,
	curiusUserSchema,
	highlightPositionSchema,
	networkInfoSchema,
	networkLinkSchema,
} from "./schemas";

/**
 * Curius user profile
 */
export type CuriusUser = z.infer<typeof curiusUserSchema>;

/**
 * Position data for relocating a highlight on a page.
 * Uses text-based matching with context for disambiguation.
 */
export type HighlightPosition = z.infer<typeof highlightPositionSchema>;

/**
 * A highlight on a link
 */
export type CuriusHighlight = z.infer<typeof curiusHighlightSchema>;

/**
 * A saved link/bookmark in Curius
 */
export type CuriusLink = z.infer<typeof curiusLinkSchema>;

/**
 * A link with friend highlights (from network endpoint)
 * @deprecated Use NetworkInfo instead
 */
export type NetworkLink = z.infer<typeof networkLinkSchema>;

/**
 * Network info for a URL (includes users who saved it and highlights)
 */
export type NetworkInfo = z.infer<typeof networkInfoSchema>;

/**
 * Options for creating a CuriusClient
 */
export interface CuriusClientOptions {
	/** JWT token for authentication */
	token: string;
	/** Base URL override (defaults to https://curius.app) */
	baseUrl?: string;
	/** Request timeout in ms (defaults to 10000) */
	timeout?: number;
}
