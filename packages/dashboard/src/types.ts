/**
 * User info included with feed items.
 */
export interface FeedUser {
	id: string;
	name: string;
	image: string | null;
}

/**
 * A bookmark from the friends feed.
 */
export interface FeedBookmark {
	id: string;
	url: string;
	title: string | null;
	description: string | null;
	createdAt: Date | string;
	user: FeedUser;
}

/**
 * A highlight from the friends feed.
 */
export interface FeedHighlight {
	id: string;
	url: string;
	text: string;
	note: string | null;
	color: string;
	createdAt: Date | string;
	user: FeedUser;
}

/**
 * User's own bookmark.
 */
export interface Bookmark {
	id: string;
	url: string;
	title: string | null;
	description: string | null;
	createdAt: Date | string;
}

/**
 * Paginated response from feed endpoints.
 */
export interface PaginatedResponse<T> {
	items: T[];
	nextCursor: string | null;
}

/**
 * Search results.
 */
export interface SearchResults {
	bookmarks: Bookmark[];
	highlights: {
		id: string;
		url: string;
		text: string;
		note: string | null;
		createdAt: Date | string;
	}[];
}

type ApiResponse<T> = Promise<{ data?: T; error?: unknown }>;

/**
 * API client interface that dashboard components expect.
 * Matches Eden Treaty client structure.
 */
export interface DashboardApiClient {
	api: {
		feed: {
			get: (options?: {
				query?: { cursor?: string; limit?: number };
			}) => ApiResponse<PaginatedResponse<FeedHighlight>>;
			bookmarks: {
				get: (options?: {
					query?: { cursor?: string; limit?: number };
				}) => ApiResponse<PaginatedResponse<FeedBookmark>>;
			};
		};
		bookmarks: {
			get: (options?: {
				query?: { cursor?: string; limit?: number };
			}) => ApiResponse<PaginatedResponse<Bookmark>>;
		};
		search: {
			get: (options: {
				query: { q: string; limit?: number };
			}) => ApiResponse<SearchResults>;
		};
	};
}
