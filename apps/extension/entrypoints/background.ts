import { createApiClient, getServerUrl } from "../utils/api";
import type {
	DashboardBookmark,
	FeedBookmark,
	FeedHighlight,
	Message,
	MessageResponse,
	PaginatedResponse,
	SearchResults,
	ServerHighlight,
} from "../utils/messages";

export default defineBackground(() => {
	console.log("[Gloss] Background script initialized", {
		id: browser.runtime.id,
	});

	// Listen for messages from content scripts
	browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		// Handle special utility messages that don't need responses
		if (message.type === "OPEN_TAB" && message.url) {
			browser.tabs.create({ url: message.url });
			return false;
		}

		const msg = message as Message;
		handleMessage(msg)
			.then(sendResponse)
			.catch((error) => {
				console.error("[Gloss] Message handler error:", error);
				sendResponse({
					error: error instanceof Error ? error.message : "Unknown error",
				});
			});

		// Return true to indicate we'll send response asynchronously
		return true;
	});
});

/**
 * Route messages to appropriate handlers.
 */
async function handleMessage(
	message: Message
): Promise<MessageResponse<Message["type"]>> {
	switch (message.type) {
		case "LOAD_HIGHLIGHTS":
			return await handleLoadHighlights(message.url);
		case "CREATE_HIGHLIGHT":
			return await handleCreateHighlight(message);
		case "UPDATE_HIGHLIGHT":
			return await handleUpdateHighlight(message.id, message.updates);
		case "DELETE_HIGHLIGHT":
			return await handleDeleteHighlight(message.id);
		case "GET_AUTH_STATUS":
			return await handleGetAuthStatus();
		case "GET_RECENT_HIGHLIGHTS":
			return await handleGetRecentHighlights(message.limit);
		// Comment messages
		case "LOAD_COMMENTS":
			return await handleLoadComments(message.highlightId);
		case "CREATE_COMMENT":
			return await handleCreateComment(message);
		case "UPDATE_COMMENT":
			return await handleUpdateComment(message);
		case "DELETE_COMMENT":
			return await handleDeleteComment(message.id);
		case "SEARCH_FRIENDS":
			return await handleSearchFriends(message.query);
		case "LOAD_PAGE_COMMENT_SUMMARY":
			return await handleLoadPageCommentSummary(message.highlightIds);
		// Bookmark messages
		case "GET_PAGE_METADATA":
			return await handleGetPageMetadata();
		case "GET_BOOKMARK_STATUS":
			return await handleGetBookmarkStatus(message.url);
		case "SAVE_BOOKMARK":
			return await handleSaveBookmark(message);
		case "UPDATE_BOOKMARK":
			return await handleUpdateBookmark(message);
		case "DELETE_BOOKMARK":
			return await handleDeleteBookmark(message.id);
		case "GET_USER_TAGS":
			return await handleGetUserTags();
		case "TOGGLE_FAVORITE":
			return await handleToggleFavorite(message.id);
		case "TOGGLE_READ_LATER":
			return await handleToggleReadLater(message.id);
		// Dashboard messages (for newtab)
		case "GET_FEED_HIGHLIGHTS":
			return await handleGetFeedHighlights(message.cursor, message.limit);
		case "GET_FEED_BOOKMARKS":
			return await handleGetFeedBookmarks(message.cursor, message.limit);
		case "GET_MY_BOOKMARKS":
			return await handleGetMyBookmarks(message.cursor, message.limit);
		case "SEARCH_DASHBOARD":
			return await handleSearchDashboard(message.query, message.limit);
		// Settings messages
		case "GET_USER_SETTINGS":
			return await handleGetUserSettings();
		case "SYNC_USER_SETTINGS":
			return await handleSyncUserSettings();
		default:
			return { error: "Unknown message type" };
	}
}

/**
 * Extract a human-readable error message from various error formats.
 */
function extractErrorMessage(error: unknown, fallback: string): string {
	if (!error) {
		return fallback;
	}

	// If it's already a string, use it
	if (typeof error === "string") {
		return error;
	}

	// If it's an object, try various common properties
	if (typeof error === "object") {
		const obj = error as Record<string, unknown>;

		// Eden error format: { value: { message: "..." } } or { value: "..." }
		if (obj.value !== undefined) {
			if (typeof obj.value === "string") {
				return obj.value;
			}
			if (
				typeof obj.value === "object" &&
				obj.value !== null &&
				"message" in obj.value
			) {
				return String((obj.value as { message: unknown }).message);
			}
		}

		// Standard error format
		if (typeof obj.message === "string") {
			return obj.message;
		}

		// Elysia validation error format
		if (typeof obj.summary === "string") {
			return obj.summary;
		}

		// Try JSON stringify for debugging (but limit length)
		try {
			const json = JSON.stringify(error);
			if (json !== "{}") {
				return json.slice(0, 200);
			}
		} catch {
			// Ignore stringify errors
		}
	}

	return fallback;
}

/**
 * Wrap an API call with consistent error handling.
 */
async function apiCall<T>(
	operation: string,
	fn: () => Promise<{ data: unknown; error: unknown }>
): Promise<T | { error: string }> {
	try {
		const response = await fn();

		if (response.error) {
			console.error(`[Gloss] API error (${operation}):`, response.error);
			return {
				error: extractErrorMessage(response.error, `Failed to ${operation}`),
			};
		}

		return response.data as T;
	} catch (error) {
		console.error(`[Gloss] Error (${operation}):`, error);
		return {
			error: extractErrorMessage(error, `Failed to ${operation}`),
		};
	}
}

/**
 * Load highlights for a specific URL.
 */
async function handleLoadHighlights(
	url: string
): Promise<{ highlights: ServerHighlight[] } | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<ServerHighlight[]>("load highlights", () =>
		api.api.highlights.get({ query: { url } })
	);

	if ("error" in result) {
		return result;
	}

	console.log(`[Gloss] Loaded ${result.length} highlights for ${url}`);
	return { highlights: result };
}

/**
 * Create a new highlight.
 */
async function handleCreateHighlight(message: {
	url: string;
	selector: ServerHighlight["selector"];
	text: string;
	visibility?: "public" | "friends" | "private";
}): Promise<{ highlight: ServerHighlight } | { error: string }> {
	console.log("[Gloss] handleCreateHighlight called with:", message.url);
	const api = createApiClient();

	const result = await apiCall<ServerHighlight>("create highlight", () =>
		api.api.highlights.post({
			url: message.url,
			selector: message.selector,
			text: message.text,
			visibility: message.visibility,
		})
	);
	console.log("[Gloss] handleCreateHighlight result:", result);

	if ("error" in result) {
		console.log("[Gloss] Returning error:", result);
		return result;
	}

	console.log("[Gloss] Created highlight:", result.id);
	return { highlight: result };
}

/**
 * Update an existing highlight.
 */
async function handleUpdateHighlight(
	id: string,
	updates: {
		visibility?: "public" | "friends" | "private";
	}
): Promise<{ highlight: ServerHighlight } | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<ServerHighlight>("update highlight", () =>
		api.api.highlights({ id }).patch(updates)
	);

	if ("error" in result) {
		return result;
	}

	console.log("[Gloss] Updated highlight:", id);
	return { highlight: result };
}

/**
 * Delete a highlight by ID.
 */
async function handleDeleteHighlight(
	id: string
): Promise<{ success: boolean } | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<{ success: boolean }>("delete highlight", () =>
		api.api.highlights({ id }).delete()
	);

	if ("error" in result) {
		return result;
	}

	console.log("[Gloss] Deleted highlight:", id);
	return { success: true };
}

/**
 * Check authentication status by querying the auth session endpoint.
 */
async function handleGetAuthStatus(): Promise<{
	authenticated: boolean;
	user?: { id: string; name: string | null };
}> {
	try {
		const serverUrl = await getServerUrl();
		const response = await fetch(`${serverUrl}/api/auth/get-session`, {
			credentials: "include",
		});

		if (!response.ok) {
			return { authenticated: false };
		}

		const session = await response.json();

		if (session?.user) {
			return {
				authenticated: true,
				user: {
					id: session.user.id,
					name: session.user.name ?? null,
				},
			};
		}

		return { authenticated: false };
	} catch (error) {
		console.error("[Gloss] Error checking auth status:", error);
		return { authenticated: false };
	}
}

/**
 * Get recent highlights for the current user.
 */
async function handleGetRecentHighlights(
	limit = 5
): Promise<{ highlights: ServerHighlight[] } | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<ServerHighlight[]>("get recent highlights", () =>
		api.api.highlights.mine.get({ query: { limit } })
	);

	if ("error" in result) {
		return result;
	}

	console.log(`[Gloss] Retrieved ${result.length} recent highlights`);
	return { highlights: result };
}

// ============================================================================
// Comment handlers
// ============================================================================

interface ServerCommentResponse {
	id: string;
	highlightId: string;
	authorId: string;
	parentId: string | null;
	content: string;
	createdAt: string;
	updatedAt: string;
	author: {
		id: string;
		name: string | null;
		image: string | null;
	};
	mentions: Array<{
		mentionedUser: {
			id: string;
			name: string | null;
		};
	}>;
}

/**
 * Load comments for a highlight.
 */
async function handleLoadComments(
	highlightId: string
): Promise<{ comments: ServerCommentResponse[] } | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<ServerCommentResponse[]>("load comments", () =>
		api.api.comments.highlight({ highlightId }).get()
	);

	if ("error" in result) {
		return result;
	}

	return { comments: result };
}

/**
 * Create a new comment.
 */
async function handleCreateComment(message: {
	highlightId: string;
	content: string;
	mentions: string[];
	parentId?: string;
}): Promise<{ comment: ServerCommentResponse } | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<ServerCommentResponse>("create comment", () =>
		api.api.comments.post({
			highlightId: message.highlightId,
			content: message.content,
			mentions: message.mentions,
			parentId: message.parentId,
		})
	);

	if ("error" in result) {
		return result;
	}

	console.log("[Gloss] Created comment:", result.id);
	return { comment: result };
}

/**
 * Update an existing comment.
 */
async function handleUpdateComment(message: {
	id: string;
	content: string;
	mentions: string[];
}): Promise<{ comment: ServerCommentResponse } | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<ServerCommentResponse>("update comment", () =>
		api.api.comments({ id: message.id }).patch({
			content: message.content,
			mentions: message.mentions,
		})
	);

	if ("error" in result) {
		return result;
	}

	console.log("[Gloss] Updated comment:", message.id);
	return { comment: result };
}

/**
 * Delete a comment.
 */
async function handleDeleteComment(
	id: string
): Promise<{ success: boolean } | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<{ success: boolean }>("delete comment", () =>
		api.api.comments({ id }).delete()
	);

	if ("error" in result) {
		return result;
	}

	console.log("[Gloss] Deleted comment:", id);
	return { success: true };
}

interface FriendResponse {
	id: string;
	name: string | null;
	image: string | null;
}

/**
 * Search friends for @mention autocomplete.
 */
async function handleSearchFriends(
	query: string
): Promise<{ friends: FriendResponse[] } | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<FriendResponse[]>("search friends", () =>
		api.api.friendships.search.get({ query: { q: query } })
	);

	if ("error" in result) {
		return result;
	}

	return { friends: result };
}

interface PageCommentSummaryResponse {
	highlightComments: Array<{
		highlightId: string;
		comments: ServerCommentResponse[];
	}>;
	totalComments: number;
	commenters: Array<{
		id: string;
		name: string | null;
		image: string | null;
	}>;
}

/**
 * Load comment summary for all highlights on a page.
 * Batches requests to get comments for each highlight and aggregates results.
 */
async function handleLoadPageCommentSummary(
	highlightIds: string[]
): Promise<PageCommentSummaryResponse | { error: string }> {
	if (highlightIds.length === 0) {
		return {
			highlightComments: [],
			totalComments: 0,
			commenters: [],
		};
	}

	const api = createApiClient();
	const highlightComments: Array<{
		highlightId: string;
		comments: ServerCommentResponse[];
	}> = [];
	const commenterMap = new Map<
		string,
		{ id: string; name: string | null; image: string | null }
	>();
	let totalComments = 0;

	// Load comments for all highlights in parallel
	const results = await Promise.allSettled(
		highlightIds.map(async (highlightId) => {
			const result = await apiCall<ServerCommentResponse[]>(
				"load comments",
				() => api.api.comments.highlight({ highlightId }).get()
			);
			return { highlightId, result };
		})
	);

	for (const settledResult of results) {
		if (settledResult.status === "rejected") {
			continue;
		}

		const { highlightId, result } = settledResult.value;
		if ("error" in result) {
			continue;
		}

		// Only include highlights that have comments
		if (result.length > 0) {
			highlightComments.push({ highlightId, comments: result });
			totalComments += result.length;

			// Collect unique commenters
			for (const comment of result) {
				if (!commenterMap.has(comment.authorId)) {
					commenterMap.set(comment.authorId, {
						id: comment.authorId,
						name: comment.author.name,
						image: comment.author.image,
					});
				}
			}
		}
	}

	return {
		highlightComments,
		totalComments,
		commenters: Array.from(commenterMap.values()),
	};
}

// ============================================================================
// Bookmark handlers
// ============================================================================

interface ServerBookmarkResponse {
	id: string;
	userId: string;
	url: string;
	urlHash: string;
	title: string | null;
	description: string | null;
	favicon: string | null;
	ogImage: string | null;
	ogDescription: string | null;
	siteName: string | null;
	createdAt: string;
	tags: Array<{
		id: string;
		name: string;
		color: string | null;
		isSystem: boolean;
	}>;
}

interface PageMetadataResponse {
	title: string;
	url: string;
	favicon: string | null;
	ogImage: string | null;
	ogDescription: string | null;
	siteName: string | null;
}

/**
 * Get page metadata from the active tab's content script.
 */
async function handleGetPageMetadata(): Promise<{
	metadata: PageMetadataResponse;
}> {
	try {
		// Get the active tab
		const [tab] = await browser.tabs.query({
			active: true,
			currentWindow: true,
		});

		if (!(tab?.id && tab.url)) {
			return {
				metadata: {
					title: "",
					url: "",
					favicon: null,
					ogImage: null,
					ogDescription: null,
					siteName: null,
				},
			};
		}

		// Send message to content script to extract metadata
		const response = await browser.tabs.sendMessage(tab.id, {
			type: "GET_PAGE_METADATA",
		});

		return { metadata: response.metadata };
	} catch (error) {
		console.error("[Gloss] Error getting page metadata:", error);
		// Return basic info from the tab itself
		const [tab] = await browser.tabs.query({
			active: true,
			currentWindow: true,
		});
		return {
			metadata: {
				title: tab?.title || "",
				url: tab?.url || "",
				favicon: tab?.favIconUrl || null,
				ogImage: null,
				ogDescription: null,
				siteName: null,
			},
		};
	}
}

/**
 * Check if a URL is bookmarked.
 */
async function handleGetBookmarkStatus(
	url: string
): Promise<
	| { bookmarked: true; bookmark: ServerBookmarkResponse }
	| { bookmarked: false; bookmark: null }
	| { error: string }
> {
	const api = createApiClient();
	const result = await apiCall<{
		bookmarked: boolean;
		bookmark: ServerBookmarkResponse | null;
	}>("check bookmark status", () =>
		api.api.bookmarks.check.get({ query: { url } })
	);

	if ("error" in result) {
		return result;
	}

	if (result.bookmarked && result.bookmark) {
		return { bookmarked: true, bookmark: result.bookmark };
	}

	return { bookmarked: false, bookmark: null };
}

/**
 * Save a new bookmark.
 */
async function handleSaveBookmark(message: {
	url: string;
	title?: string;
	favicon?: string;
	ogImage?: string;
	ogDescription?: string;
	siteName?: string;
	tags?: string[];
}): Promise<{ bookmark: ServerBookmarkResponse } | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<ServerBookmarkResponse>("save bookmark", () =>
		api.api.bookmarks.post({
			url: message.url,
			title: message.title,
			favicon: message.favicon,
			ogImage: message.ogImage,
			ogDescription: message.ogDescription,
			siteName: message.siteName,
			tags: message.tags,
		})
	);

	if ("error" in result) {
		return result;
	}

	console.log("[Gloss] Saved bookmark:", result.id);
	return { bookmark: result };
}

/**
 * Update an existing bookmark.
 */
async function handleUpdateBookmark(message: {
	id: string;
	title?: string;
	description?: string;
	tags?: string[];
}): Promise<{ bookmark: ServerBookmarkResponse } | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<ServerBookmarkResponse>("update bookmark", () =>
		api.api.bookmarks({ id: message.id }).patch({
			title: message.title,
			description: message.description,
			tags: message.tags,
		})
	);

	if ("error" in result) {
		return result;
	}

	console.log("[Gloss] Updated bookmark:", message.id);
	return { bookmark: result };
}

/**
 * Delete a bookmark.
 */
async function handleDeleteBookmark(
	id: string
): Promise<{ success: boolean } | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<{ success: boolean }>("delete bookmark", () =>
		api.api.bookmarks({ id }).delete()
	);

	if ("error" in result) {
		return result;
	}

	console.log("[Gloss] Deleted bookmark:", id);
	return { success: true };
}

/**
 * Get user's tags for autocomplete.
 */
async function handleGetUserTags(): Promise<
	| {
			tags: Array<{
				id: string;
				name: string;
				color: string | null;
				isSystem: boolean;
			}>;
	  }
	| { error: string }
> {
	const api = createApiClient();
	const result = await apiCall<{
		tags: Array<{
			id: string;
			name: string;
			color: string | null;
			isSystem: boolean;
		}>;
	}>("get user tags", () => api.api.bookmarks.tags.get({ query: {} }));

	if ("error" in result) {
		return result;
	}

	return { tags: result.tags };
}

/**
 * Toggle favorite status on a bookmark.
 * Returns the new favorited state - UI should refresh bookmark to see updated tags.
 */
async function handleToggleFavorite(
	id: string
): Promise<
	{ favorited: boolean; bookmark: ServerBookmarkResponse } | { error: string }
> {
	const api = createApiClient();
	const result = await apiCall<{ favorited: boolean }>("toggle favorite", () =>
		api.api.bookmarks({ id }).favorite.post({})
	);

	if ("error" in result) {
		return result;
	}

	console.log("[Gloss] Toggled favorite:", id, result.favorited);
	return {
		favorited: result.favorited,
		bookmark: {} as ServerBookmarkResponse, // UI should refetch to get updated tags
	};
}

/**
 * Toggle to-read status on a bookmark.
 * Returns the new toRead state - UI should refresh bookmark to see updated tags.
 */
async function handleToggleReadLater(
	id: string
): Promise<
	{ toRead: boolean; bookmark: ServerBookmarkResponse } | { error: string }
> {
	const api = createApiClient();
	const result = await apiCall<{ toRead: boolean }>("toggle to-read", () =>
		api.api.bookmarks({ id })["to-read"].post({})
	);

	if ("error" in result) {
		return result;
	}

	console.log("[Gloss] Toggled to-read:", id, result.toRead);
	return {
		toRead: result.toRead,
		bookmark: {} as ServerBookmarkResponse, // UI should refetch to get updated tags
	};
}

// ============================================================================
// Dashboard handlers (for newtab)
// ============================================================================

const DEFAULT_LIMIT = 20;

/**
 * Get feed highlights (friends' highlights).
 */
async function handleGetFeedHighlights(
	cursor?: string,
	limit?: number
): Promise<PaginatedResponse<FeedHighlight> | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<PaginatedResponse<FeedHighlight>>(
		"get feed highlights",
		() => api.api.feed.get({ query: { cursor, limit: limit ?? DEFAULT_LIMIT } })
	);

	if ("error" in result) {
		return result;
	}

	return result;
}

/**
 * Get feed bookmarks (friends' bookmarks).
 */
async function handleGetFeedBookmarks(
	cursor?: string,
	limit?: number
): Promise<PaginatedResponse<FeedBookmark> | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<PaginatedResponse<FeedBookmark>>(
		"get feed bookmarks",
		() =>
			api.api.feed.bookmarks.get({
				query: { cursor, limit: limit ?? DEFAULT_LIMIT },
			})
	);

	if ("error" in result) {
		return result;
	}

	return result;
}

/**
 * Get user's own bookmarks.
 */
async function handleGetMyBookmarks(
	cursor?: string,
	limit?: number
): Promise<PaginatedResponse<DashboardBookmark> | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<PaginatedResponse<DashboardBookmark>>(
		"get my bookmarks",
		() =>
			api.api.bookmarks.get({
				query: { cursor, limit: limit ?? DEFAULT_LIMIT },
			})
	);

	if ("error" in result) {
		return result;
	}

	return result;
}

/**
 * Search bookmarks and highlights.
 */
async function handleSearchDashboard(
	searchQuery: string,
	limit?: number
): Promise<SearchResults | { error: string }> {
	const api = createApiClient();
	const result = await apiCall<SearchResults>("search dashboard", () =>
		api.api.search.get({
			query: { q: searchQuery, limit: limit ?? DEFAULT_LIMIT },
		})
	);

	if ("error" in result) {
		return result;
	}

	return result;
}

// ============================================================================
// Settings handlers
// ============================================================================

const SETTINGS_STORAGE_KEY = "glossUserSettings";
const SETTINGS_LAST_SYNC_KEY = "glossSettingsLastSync";
const SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface UserSettingsData {
	profileVisibility: "public" | "friends" | "private";
	highlightsVisibility: "public" | "friends" | "private";
	bookmarksVisibility: "public" | "friends" | "private";
	highlightDisplayFilter: "anyone" | "friends" | "me";
	commentDisplayMode: "expanded" | "collapsed";
}

const DEFAULT_SETTINGS: UserSettingsData = {
	profileVisibility: "public",
	highlightsVisibility: "friends",
	bookmarksVisibility: "public",
	highlightDisplayFilter: "friends",
	commentDisplayMode: "collapsed",
};

/**
 * Get user settings from storage, or sync from server if stale/missing.
 */
async function handleGetUserSettings(): Promise<
	{ settings: UserSettingsData } | { error: string }
> {
	try {
		const stored = await browser.storage.sync.get([
			SETTINGS_STORAGE_KEY,
			SETTINGS_LAST_SYNC_KEY,
		]);

		const lastSync = stored[SETTINGS_LAST_SYNC_KEY] as number | undefined;
		const cachedSettings = stored[SETTINGS_STORAGE_KEY] as
			| UserSettingsData
			| undefined;

		// If we have cached settings and they're fresh, return them
		if (
			cachedSettings &&
			lastSync &&
			Date.now() - lastSync < SETTINGS_CACHE_TTL
		) {
			return { settings: cachedSettings };
		}

		// Otherwise, sync from server
		return await handleSyncUserSettings();
	} catch (error) {
		console.error("[Gloss] Error getting user settings:", error);
		// Return defaults if we can't fetch settings
		return { settings: DEFAULT_SETTINGS };
	}
}

/**
 * Sync user settings from server and store in browser.storage.sync.
 */
async function handleSyncUserSettings(): Promise<
	{ settings: UserSettingsData } | { error: string }
> {
	const api = createApiClient();
	const result = await apiCall<UserSettingsData>("sync user settings", () =>
		api.api.users.me.settings.get()
	);

	if ("error" in result) {
		// If we can't fetch settings, try to return cached settings
		try {
			const stored = await browser.storage.sync.get(SETTINGS_STORAGE_KEY);
			const cachedSettings = stored[SETTINGS_STORAGE_KEY] as
				| UserSettingsData
				| undefined;
			if (cachedSettings) {
				return { settings: cachedSettings };
			}
		} catch {
			// Ignore storage errors
		}
		// Return defaults if all else fails
		return { settings: DEFAULT_SETTINGS };
	}

	// Store settings in browser.storage.sync
	try {
		await browser.storage.sync.set({
			[SETTINGS_STORAGE_KEY]: result,
			[SETTINGS_LAST_SYNC_KEY]: Date.now(),
		});
		console.log("[Gloss] Synced user settings from server");
	} catch (error) {
		console.error("[Gloss] Error storing user settings:", error);
	}

	return { settings: result };
}
