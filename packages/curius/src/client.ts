import type { z } from "zod";
import {
	CuriusAuthError,
	CuriusError,
	CuriusNotFoundError,
	CuriusRateLimitError,
	CuriusValidationError,
} from "./errors";
import {
	addHighlightResponseSchema,
	addLinkResponseSchema,
	getFollowingResponseSchema,
	getLinkByUrlResponseSchema,
	getNetworkLinksResponseSchema,
	getUserLinksResponseSchema,
	getUserResponseSchema,
} from "./schemas";
import type {
	CuriusClientOptions,
	CuriusHighlight,
	CuriusLink,
	CuriusUser,
	HighlightPosition,
	NetworkInfo,
} from "./types";

const CURIUS_BASE_URL = "https://curius.app";
const DEFAULT_TIMEOUT = 10_000;

/**
 * API endpoints for Curius
 */
const ENDPOINTS = {
	// User
	GET_USER: "/api/user",
	GET_FOLLOWING: "/api/user/following/",

	// Links
	ADD_LINK: "/api/links",
	GET_USER_LINKS: "/api/links",
	GET_LINK_BY_URL: "/api/links/url",
	GET_NETWORK_LINKS: "/api/links/url/network",
	DELETE_LINK: (id: string) => `/api/links/${id}`,
	RENAME_LINK: (id: string) => `/api/links/${id}/title`,

	// Highlights
	ADD_HIGHLIGHT: (linkId: string) => `/api/links/${linkId}/highlights`,
	DELETE_HIGHLIGHT: (linkId: string) => `/api/links/${linkId}/highlights`,

	// Topics
	GET_TOPICS: "/api/user/topics",
	CLASSIFY_LINK: (linkId: string) => `/api/links/${linkId}/classify`,
} as const;

/**
 * Type-safe client for the Curius API.
 *
 * All responses are validated with Zod schemas for runtime type safety.
 */
export class CuriusClient {
	private readonly token: string;
	private readonly baseUrl: string;
	private readonly timeout: number;

	constructor(options: CuriusClientOptions) {
		this.token = options.token;
		this.baseUrl = options.baseUrl ?? CURIUS_BASE_URL;
		this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
	}

	// =========================================================================
	// Private helpers
	// =========================================================================

	/**
	 * Make an authenticated request to the Curius API
	 */
	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
		schema?: z.ZodSchema<T>
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
				headers: {
					Authorization: `Bearer ${this.token}`,
					"Content-Type": "application/json",
					...options.headers,
				},
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				await this.handleErrorResponse(response);
			}

			const data = await response.json();

			if (schema) {
				const result = schema.safeParse(data);
				if (!result.success) {
					throw new CuriusValidationError(
						`Invalid response format: ${result.error.message}`
					);
				}
				return result.data;
			}

			return data as T;
		} catch (error) {
			clearTimeout(timeoutId);

			if (error instanceof CuriusError) {
				throw error;
			}

			if (error instanceof Error && error.name === "AbortError") {
				throw new CuriusError("Request timeout", undefined, "TIMEOUT");
			}

			throw new CuriusError(
				error instanceof Error ? error.message : "Unknown error"
			);
		}
	}

	/**
	 * Handle non-OK HTTP responses
	 */
	private async handleErrorResponse(response: Response): Promise<never> {
		const status = response.status;

		if (status === 401) {
			throw new CuriusAuthError();
		}

		if (status === 404) {
			throw new CuriusNotFoundError();
		}

		if (status === 429) {
			const retryAfter = response.headers.get("Retry-After");
			throw new CuriusRateLimitError(
				"Rate limit exceeded",
				retryAfter ? Number.parseInt(retryAfter, 10) : undefined
			);
		}

		let message = `HTTP ${status}`;
		try {
			const errorBody = (await response.json()) as Record<string, unknown>;
			if (typeof errorBody.error === "string") {
				message = errorBody.error;
			} else if (typeof errorBody.message === "string") {
				message = errorBody.message;
			}
		} catch {
			// Ignore JSON parse errors for error body
		}

		throw new CuriusError(message, status);
	}

	// =========================================================================
	// User endpoints
	// =========================================================================

	/**
	 * Get the current authenticated user's profile
	 */
	async getUser(): Promise<CuriusUser> {
		const response = await this.request(
			ENDPOINTS.GET_USER,
			{ method: "GET" },
			getUserResponseSchema
		);
		return response.user;
	}

	/**
	 * Get list of users the current user is following
	 */
	async getFollowing(): Promise<CuriusUser[]> {
		const response = await this.request(
			ENDPOINTS.GET_FOLLOWING,
			{ method: "GET" },
			getFollowingResponseSchema
		);
		return response.following;
	}

	// =========================================================================
	// Link endpoints
	// =========================================================================

	/**
	 * Get all links saved by the current user (with highlights)
	 */
	async getUserLinks(): Promise<CuriusLink[]> {
		const response = await this.request(
			ENDPOINTS.GET_USER_LINKS,
			{ method: "GET" },
			getUserLinksResponseSchema
		);
		return response.links;
	}

	/**
	 * Add a new link/bookmark
	 */
	async addLink(input: {
		url: string;
		title?: string;
		highlightText?: string;
		highlightPosition?: HighlightPosition;
	}): Promise<CuriusLink> {
		return await this.request(
			ENDPOINTS.ADD_LINK,
			{
				method: "POST",
				body: JSON.stringify(input),
			},
			addLinkResponseSchema
		);
	}

	/**
	 * Get a link by URL (check if URL is already saved)
	 */
	async getLinkByUrl(url: string): Promise<CuriusLink | null> {
		try {
			const response = await this.request(
				ENDPOINTS.GET_LINK_BY_URL,
				{
					method: "POST",
					body: JSON.stringify({ url }),
				},
				getLinkByUrlResponseSchema
			);
			return response.link;
		} catch (error) {
			if (error instanceof CuriusNotFoundError) {
				return null;
			}
			throw error;
		}
	}

	/**
	 * Get network info for a URL (who saved it and their highlights)
	 */
	async getNetworkInfo(url: string): Promise<NetworkInfo> {
		const response = await this.request(
			ENDPOINTS.GET_NETWORK_LINKS,
			{
				method: "POST",
				body: JSON.stringify({ url }),
			},
			getNetworkLinksResponseSchema
		);
		return response.networkInfo;
	}

	/**
	 * Delete a saved link
	 */
	async deleteLink(linkId: string): Promise<void> {
		await this.request(ENDPOINTS.DELETE_LINK(linkId), {
			method: "DELETE",
		});
	}

	/**
	 * Rename a link's title
	 */
	async renameLink(linkId: string, title: string): Promise<void> {
		await this.request(ENDPOINTS.RENAME_LINK(linkId), {
			method: "POST",
			body: JSON.stringify({ title }),
		});
	}

	// =========================================================================
	// Highlight endpoints
	// =========================================================================

	/**
	 * Add a highlight to an existing link
	 */
	async addHighlight(
		linkId: string,
		position: HighlightPosition
	): Promise<CuriusHighlight> {
		return await this.request(
			ENDPOINTS.ADD_HIGHLIGHT(linkId),
			{
				method: "POST",
				body: JSON.stringify({ highlight: position.rawHighlight, ...position }),
			},
			addHighlightResponseSchema
		);
	}

	/**
	 * Delete a highlight from a link
	 */
	async deleteHighlight(linkId: string, highlightText: string): Promise<void> {
		await this.request(ENDPOINTS.DELETE_HIGHLIGHT(linkId), {
			method: "DELETE",
			body: JSON.stringify({ highlightText }),
		});
	}

	// =========================================================================
	// Utility methods
	// =========================================================================

	/**
	 * Verify that the token is valid by attempting to fetch the user
	 */
	async verifyToken(): Promise<boolean> {
		try {
			await this.getUser();
			return true;
		} catch (error) {
			if (error instanceof CuriusAuthError) {
				return false;
			}
			throw error;
		}
	}
}

/**
 * Create a new Curius client instance
 */
export function createCuriusClient(options: CuriusClientOptions): CuriusClient {
	return new CuriusClient(options);
}
