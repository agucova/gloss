import { getApiKey, getApiUrl } from "./config.js";

/**
 * API error with status code and message.
 */
export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = "ApiError";
	}
}

/**
 * Base response type for API calls.
 */
export interface ApiResponse<T> {
	data?: T;
	error?: string;
}

/**
 * Highlight entity from the API.
 */
export interface Highlight {
	id: string;
	url: string;
	text: string;
	visibility: "private" | "friends" | "public";
	createdAt: string;
	user: {
		id: string;
		name: string | null;
		image: string | null;
	};
}

/**
 * Tag entity.
 */
export interface Tag {
	id: string;
	name: string;
	color: string | null;
	isSystem: boolean;
}

/**
 * Bookmark entity from the API.
 */
export interface Bookmark {
	id: string;
	url: string;
	title: string | null;
	description: string | null;
	favicon: string | null;
	createdAt: string;
	tags: Tag[];
}

/**
 * Comment entity from the API.
 */
export interface Comment {
	id: string;
	content: string;
	highlightId: string;
	createdAt: string;
	author: {
		id: string;
		name: string | null;
		image: string | null;
	};
}

/**
 * Search result from the API.
 */
export interface SearchResult {
	type: "bookmark" | "highlight" | "comment";
	id: string;
	url?: string;
	text?: string;
	title?: string;
	description?: string;
	content?: string;
	score: number;
	ftsScore: number;
	semanticScore: number;
	createdAt: string;
	tags?: Tag[];
	user?: { id: string; name: string | null; image: string | null };
	author?: { id: string; name: string | null; image: string | null };
}

/**
 * User info from the API.
 */
export interface UserInfo {
	id: string;
	name: string;
	email: string;
	image?: string | null;
}

/**
 * Make an authenticated API request.
 */
async function apiRequest<T>(
	path: string,
	options: RequestInit = {}
): Promise<T> {
	const apiKey = getApiKey();
	if (!apiKey) {
		throw new ApiError(401, "Not authenticated. Run 'gloss auth login' first.");
	}

	const apiUrl = getApiUrl();
	const url = `${apiUrl}${path}`;

	const headers = new Headers(options.headers);
	headers.set("Authorization", `Bearer ${apiKey}`);
	headers.set("Content-Type", "application/json");

	const response = await fetch(url, {
		...options,
		headers,
	});

	if (!response.ok) {
		let message = `API error: ${response.status} ${response.statusText}`;
		try {
			const errorBody = (await response.json()) as { error?: string };
			if (errorBody.error) {
				message = errorBody.error;
			}
		} catch {
			// Ignore JSON parse errors
		}
		throw new ApiError(response.status, message);
	}

	return response.json() as Promise<T>;
}

/**
 * Search options.
 */
export interface SearchOptions {
	query: string;
	types?: string[];
	tagName?: string;
	tagId?: string;
	url?: string;
	domain?: string;
	after?: string;
	before?: string;
	sortBy?: "relevance" | "created";
	limit?: number;
	offset?: number;
	mode?: "hybrid" | "fts" | "semantic";
}

/**
 * Search response from the API.
 */
export interface SearchResponse {
	results: SearchResult[];
	meta: {
		query: string;
		mode: string;
		semanticSearchUsed: boolean;
		total: number;
		limit: number;
		offset: number;
		sortBy: string;
	};
}

/**
 * Search highlights, bookmarks, and comments.
 */
export async function search(options: SearchOptions): Promise<SearchResponse> {
	const params = new URLSearchParams();
	params.set("q", options.query);
	if (options.types?.length) {
		params.set("types", options.types.join(","));
	}
	if (options.tagName) {
		params.set("tagName", options.tagName);
	}
	if (options.tagId) {
		params.set("tagId", options.tagId);
	}
	if (options.url) {
		params.set("url", options.url);
	}
	if (options.domain) {
		params.set("domain", options.domain);
	}
	if (options.after) {
		params.set("after", options.after);
	}
	if (options.before) {
		params.set("before", options.before);
	}
	if (options.sortBy) {
		params.set("sortBy", options.sortBy);
	}
	if (options.limit) {
		params.set("limit", options.limit.toString());
	}
	if (options.offset) {
		params.set("offset", options.offset.toString());
	}
	if (options.mode) {
		params.set("mode", options.mode);
	}

	return apiRequest<SearchResponse>(`/api/search?${params.toString()}`);
}

/**
 * List options for pagination.
 */
export interface ListOptions {
	limit?: number;
	cursor?: string;
}

/**
 * Paginated response.
 */
export interface PaginatedResponse<T> {
	items: T[];
	nextCursor: string | null;
}

/**
 * List user's highlights.
 */
export async function listHighlights(
	options: ListOptions = {}
): Promise<PaginatedResponse<Highlight>> {
	const params = new URLSearchParams();
	if (options.limit) {
		params.set("limit", options.limit.toString());
	}
	if (options.cursor) {
		params.set("cursor", options.cursor);
	}
	return apiRequest<PaginatedResponse<Highlight>>(
		`/api/highlights/mine?${params.toString()}`
	);
}

/**
 * List user's bookmarks.
 */
export async function listBookmarks(
	options: ListOptions = {}
): Promise<PaginatedResponse<Bookmark>> {
	const params = new URLSearchParams();
	if (options.limit) {
		params.set("limit", options.limit.toString());
	}
	if (options.cursor) {
		params.set("cursor", options.cursor);
	}
	return apiRequest<PaginatedResponse<Bookmark>>(
		`/api/bookmarks?${params.toString()}`
	);
}

/**
 * List user's tags.
 */
export async function listTags(limit = 50): Promise<{ tags: Tag[] }> {
	const params = new URLSearchParams();
	params.set("limit", limit.toString());
	return apiRequest<{ tags: Tag[] }>(
		`/api/bookmarks/tags?${params.toString()}`
	);
}

/**
 * Get current user info.
 */
export async function getCurrentUser(): Promise<UserInfo> {
	return apiRequest<UserInfo>("/api/users/me");
}
