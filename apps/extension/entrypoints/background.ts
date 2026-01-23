import { createApiClient, getServerUrl } from "../utils/api";
import type {
	Message,
	MessageResponse,
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
		default:
			return { error: "Unknown message type" };
	}
}

/**
 * Wrap an API call with consistent error handling.
 */
async function apiCall<T>(
	operation: string,
	fn: () => Promise<{ data: unknown; error: { value?: unknown } | null }>
): Promise<T | { error: string }> {
	try {
		const response = await fn();

		if (response.error) {
			console.error(`[Gloss] API error (${operation}):`, response.error);
			return {
				error: response.error.value?.toString() ?? `Failed to ${operation}`,
			};
		}

		return response.data as T;
	} catch (error) {
		console.error(`[Gloss] Error (${operation}):`, error);
		return {
			error: error instanceof Error ? error.message : `Failed to ${operation}`,
		};
	}
}

/**
 * Load highlights for a specific URL.
 */
async function handleLoadHighlights(
	url: string
): Promise<{ highlights: ServerHighlight[] } | { error: string }> {
	const api = await createApiClient();
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
	color?: string;
	visibility?: "public" | "friends" | "private";
}): Promise<{ highlight: ServerHighlight } | { error: string }> {
	const api = await createApiClient();
	const result = await apiCall<ServerHighlight>("create highlight", () =>
		api.api.highlights.post({
			url: message.url,
			selector: message.selector,
			text: message.text,
			color: message.color,
			visibility: message.visibility,
		})
	);

	if ("error" in result) {
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
		color?: string;
		note?: string;
		visibility?: "public" | "friends" | "private";
	}
): Promise<{ highlight: ServerHighlight } | { error: string }> {
	const api = await createApiClient();
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
	const api = await createApiClient();
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
	const api = await createApiClient();
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
	const api = await createApiClient();
	const result = await apiCall<ServerCommentResponse[]>("load comments", () =>
		api.api.comments.highlight({ highlightId }).get()
	);

	if ("error" in result) {
		return result;
	}

	console.log(
		`[Gloss] Loaded ${result.length} comments for highlight ${highlightId}`
	);
	return { comments: result };
}

/**
 * Create a new comment.
 */
async function handleCreateComment(message: {
	highlightId: string;
	content: string;
	mentions: string[];
}): Promise<{ comment: ServerCommentResponse } | { error: string }> {
	const api = await createApiClient();
	const result = await apiCall<ServerCommentResponse>("create comment", () =>
		api.api.comments.post({
			highlightId: message.highlightId,
			content: message.content,
			mentions: message.mentions,
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
	const api = await createApiClient();
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
	const api = await createApiClient();
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
	const api = await createApiClient();
	const result = await apiCall<FriendResponse[]>("search friends", () =>
		api.api.friendships.search.get({ query: { q: query } })
	);

	if ("error" in result) {
		return result;
	}

	return { friends: result };
}
