import type { Id } from "../../../convex/_generated/dataModel";
import type {
	Comment,
	Message,
	MessageResponse,
	PageCommentSummary,
	UserSettings,
} from "../utils/messages";

import { api, getConvexClient } from "../utils/api";
import { authClient } from "../utils/auth-client";

export default defineBackground(() => {
	console.log("[Gloss] Background script initialized", {
		id: browser.runtime.id,
	});

	initializeThemeIcon();

	browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (message.type === "COLOR_SCHEME") {
			updateToolbarIcon(message.dark as boolean);
			sendResponse({ success: true });
			return false;
		}

		if (message.type === "OPEN_TAB" && message.url) {
			browser.tabs.create({ url: message.url });
			return false;
		}

		const msg = message as Message;
		ensureAuth()
			.then(() => handleMessage(msg))
			.then(sendResponse)
			.catch((error) => {
				console.error("[Gloss] Message handler error:", error);
				sendResponse({
					error: error instanceof Error ? error.message : "Unknown error",
				});
			});

		return true;
	});
});

// ─── Auth ────────────────────────────────────────────
//
// The extension authClient (see utils/auth-client.ts) holds the Better-Auth
// session via the `crossDomain` plugin. Before each incoming message we fetch
// a fresh Convex JWT from `/api/auth/convex/token` and push it onto the shared
// ConvexHttpClient. A short in-memory TTL cache keeps the token refresh rate
// reasonable — Convex JWTs default to ~5 minutes, so we refresh every 4.

const JWT_TTL_MS = 4 * 60 * 1000;
let cachedJwt: { token: string; fetchedAt: number } | null = null;

async function fetchConvexJwt(): Promise<string | null> {
	try {
		const result = (await authClient.$fetch("/convex/token")) as {
			data: { token: string } | null;
			error: unknown;
		};
		return result.data?.token ?? null;
	} catch (err) {
		console.warn("[Gloss] Failed to fetch Convex JWT:", err);
		return null;
	}
}

async function ensureAuth(): Promise<void> {
	const client = getConvexClient();
	const now = Date.now();
	if (cachedJwt && now - cachedJwt.fetchedAt < JWT_TTL_MS) {
		client.setAuth(cachedJwt.token);
		return;
	}
	const token = await fetchConvexJwt();
	if (token) {
		cachedJwt = { token, fetchedAt: now };
		client.setAuth(token);
	} else {
		cachedJwt = null;
		client.clearAuth();
	}
}

function updateToolbarIcon(isDark: boolean): void {
	const dir = isDark ? "icon-dark" : "icon";
	console.log(`[Gloss] Setting toolbar icon: ${dir} (isDark=${isDark})`);
	browser.action.setIcon({
		path: {
			16: `${dir}/16.png`,
			32: `${dir}/32.png`,
			48: `${dir}/48.png`,
			128: `${dir}/128.png`,
		},
	});
}

async function ensureOffscreenDocument(): Promise<boolean> {
	try {
		const offscreenUrl = chrome.runtime.getURL("offscreen.html");
		const existingContexts = await chrome.runtime.getContexts?.({
			contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
			documentUrls: [offscreenUrl],
		});
		if (existingContexts && existingContexts.length > 0) return true;

		await chrome.offscreen.createDocument({
			url: "offscreen.html",
			reasons: ["DOM_SCRAPING" as chrome.offscreen.Reason],
			justification: "Detect prefers-color-scheme for toolbar icon",
		});
		return true;
	} catch {
		return false;
	}
}

async function initializeThemeIcon(): Promise<void> {
	const success = await ensureOffscreenDocument();
	if (success) {
		setTimeout(() => {
			chrome.runtime.sendMessage({ action: "detect-theme" }).catch(() => {});
		}, 100);
	}
}

/**
 * Wrap a Convex call with consistent error handling.
 */
async function convexCall<T>(
	operation: string,
	fn: () => Promise<T>
): Promise<T | { error: string }> {
	try {
		return await fn();
	} catch (error) {
		console.error(`[Gloss] Error (${operation}):`, error);
		return {
			error: error instanceof Error ? error.message : `Failed to ${operation}`,
		};
	}
}

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
		case "GET_CONVEX_JWT":
			return { token: cachedJwt?.token ?? null };
		case "GET_RECENT_HIGHLIGHTS":
			return await handleGetRecentHighlights(message.limit);
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
		case "GET_PAGE_METADATA":
			return await handleGetPageMetadata(message.tabId);
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
		case "GET_USER_SETTINGS":
			return await handleGetUserSettings();
		case "UPDATE_THEME_PREFERENCE":
			return await handleUpdateThemePreference(message.themePreference);
		case "SYNC_USER_SETTINGS":
			return await handleSyncUserSettings();
		default:
			return { error: "Unknown message type" };
	}
}

// ─── Highlight handlers ─────────────────────────────

async function handleLoadHighlights(url: string) {
	const client = getConvexClient();
	const result = await convexCall("load highlights", () =>
		client.query(api.highlights.getByUrl, { url })
	);
	if ("error" in result) return result;
	return { highlights: result };
}

async function handleCreateHighlight(message: {
	url: string;
	selector: unknown;
	text: string;
	visibility?: "public" | "friends" | "private";
}) {
	const client = getConvexClient();
	const result = await convexCall("create highlight", () =>
		client.mutation(api.highlights.create, {
			url: message.url,
			selector: message.selector,
			text: message.text,
			visibility: message.visibility,
		})
	);
	if ("error" in result) return result;
	return { highlight: result };
}

async function handleUpdateHighlight(
	id: Id<"highlights">,
	updates: { visibility?: "public" | "friends" | "private" }
) {
	const client = getConvexClient();
	const result = await convexCall("update highlight", () =>
		client.mutation(api.highlights.update, {
			id,
			visibility: updates.visibility,
		})
	);
	if ("error" in result) return result;
	return { highlight: result };
}

async function handleDeleteHighlight(id: Id<"highlights">) {
	const client = getConvexClient();
	const result = await convexCall("delete highlight", () =>
		client.mutation(api.highlights.remove, { id })
	);
	if ("error" in result) return result;
	return { success: true };
}

async function handleGetAuthStatus(): Promise<
	MessageResponse<"GET_AUTH_STATUS">
> {
	try {
		// `ensureAuth()` has already populated the Convex client (or cleared it
		// when there is no session). A successful `users.getMe` query proves we
		// have both a Better-Auth session AND a matching app-side users row.
		const client = getConvexClient();
		const user = await client.query(api.users.getMe);
		if (!user) return { authenticated: false };
		return {
			authenticated: true,
			user: { _id: user._id, name: user.name },
		};
	} catch {
		return { authenticated: false };
	}
}

async function handleGetRecentHighlights(limit = 5) {
	const client = getConvexClient();
	const result = await convexCall("get recent highlights", () =>
		client.query(api.highlights.listMine, {
			paginationOpts: { numItems: limit, cursor: null },
		})
	);
	if ("error" in result) return result;
	return { highlights: result.page };
}

// ─── Comment handlers ─────────────────────────────

async function handleLoadComments(highlightId: Id<"highlights">) {
	const client = getConvexClient();
	const result = await convexCall("load comments", () =>
		client.query(api.comments.getForHighlight, { highlightId })
	);
	if ("error" in result) return result;
	return { comments: result };
}

async function handleCreateComment(message: {
	highlightId: Id<"highlights">;
	content: string;
	mentions: Id<"users">[];
	parentId?: Id<"comments">;
}) {
	const client = getConvexClient();
	const result = await convexCall("create comment", () =>
		client.mutation(api.comments.create, {
			highlightId: message.highlightId,
			content: message.content,
			mentionedUserIds: message.mentions,
			parentId: message.parentId,
		})
	);
	if ("error" in result) return result;
	return { comment: result };
}

async function handleUpdateComment(message: {
	id: Id<"comments">;
	content: string;
	mentions: Id<"users">[];
}) {
	const client = getConvexClient();
	const result = await convexCall("update comment", () =>
		client.mutation(api.comments.update, {
			id: message.id,
			content: message.content,
			mentionedUserIds: message.mentions,
		})
	);
	if ("error" in result) return result;
	return { comment: result };
}

async function handleDeleteComment(id: Id<"comments">) {
	const client = getConvexClient();
	const result = await convexCall("delete comment", () =>
		client.mutation(api.comments.remove, { id })
	);
	if ("error" in result) return result;
	return { success: true };
}

async function handleSearchFriends(query: string) {
	const client = getConvexClient();
	const result = await convexCall("search friends", () =>
		client.query(api.friendships.searchFriends, { q: query })
	);
	if ("error" in result) return result;
	return { friends: result };
}

async function handleLoadPageCommentSummary(
	highlightIds: Id<"highlights">[]
): Promise<PageCommentSummary | { error: string }> {
	if (highlightIds.length === 0) {
		return { highlightComments: [], totalComments: 0, commenters: [] };
	}

	const client = getConvexClient();
	const highlightComments: PageCommentSummary["highlightComments"] = [];
	const commenterMap = new Map<
		Id<"users">,
		{ _id: Id<"users">; name: string; image: string | undefined }
	>();
	let totalComments = 0;

	const results = await Promise.allSettled(
		highlightIds.map(async (highlightId) => {
			const comments = await client.query(api.comments.getForHighlight, {
				highlightId,
			});
			return { highlightId, comments };
		})
	);

	for (const settledResult of results) {
		if (settledResult.status === "rejected") continue;
		const { highlightId, comments } = settledResult.value;
		if (comments.length === 0) continue;

		highlightComments.push({ highlightId, comments: comments as Comment[] });
		totalComments += comments.length;

		for (const c of comments) {
			if (c.author && !commenterMap.has(c.author._id)) {
				commenterMap.set(c.author._id, {
					_id: c.author._id,
					name: c.author.name,
					image: c.author.image,
				});
			}
		}
	}

	return {
		highlightComments,
		totalComments,
		commenters: Array.from(commenterMap.values()),
	};
}

// ─── Bookmark handlers ─────────────────────────────

interface PageMetadataResponse {
	title: string;
	url: string;
	favicon: string | null;
	ogImage: string | null;
	ogDescription: string | null;
	siteName: string | null;
}

async function handleGetPageMetadata(tabId?: number): Promise<{
	metadata: PageMetadataResponse;
}> {
	try {
		const tab = tabId
			? await browser.tabs.get(tabId)
			: (await browser.tabs.query({ active: true, currentWindow: true }))[0];

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

		const response = await browser.tabs.sendMessage(tab.id, {
			type: "GET_PAGE_METADATA",
		});

		return { metadata: response.metadata };
	} catch {
		const tab = tabId
			? await browser.tabs.get(tabId).catch(() => undefined)
			: (await browser.tabs.query({ active: true, currentWindow: true }))[0];
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

async function handleGetBookmarkStatus(url: string) {
	const client = getConvexClient();
	const result = await convexCall("check bookmark status", () =>
		client.query(api.bookmarks.checkUrl, { url })
	);
	if (result && "error" in result) return result;
	if (result) return { bookmarked: true as const, bookmark: result };
	return { bookmarked: false as const, bookmark: null };
}

async function handleSaveBookmark(message: {
	url: string;
	title?: string;
	favicon?: string;
	ogImage?: string;
	ogDescription?: string;
	siteName?: string;
	tags?: string[];
}) {
	const client = getConvexClient();
	const result = await convexCall("save bookmark", () =>
		client.mutation(api.bookmarks.create, {
			url: message.url,
			title: message.title,
			favicon: message.favicon,
			ogImage: message.ogImage,
			ogDescription: message.ogDescription,
			siteName: message.siteName,
			tags: message.tags,
		})
	);
	if ("error" in result) return result;
	return { bookmark: result };
}

async function handleUpdateBookmark(message: {
	id: Id<"bookmarks">;
	title?: string;
	description?: string;
	tags?: string[];
}) {
	const client = getConvexClient();
	const result = await convexCall("update bookmark", () =>
		client.mutation(api.bookmarks.update, {
			id: message.id,
			title: message.title,
			description: message.description,
			tags: message.tags,
		})
	);
	if ("error" in result) return result;
	return { bookmark: result };
}

async function handleDeleteBookmark(id: Id<"bookmarks">) {
	const client = getConvexClient();
	const result = await convexCall("delete bookmark", () =>
		client.mutation(api.bookmarks.remove, { id })
	);
	if ("error" in result) return result;
	return { success: true };
}

async function handleGetUserTags() {
	const client = getConvexClient();
	const result = await convexCall("get user tags", () =>
		client.query(api.bookmarks.listTags, {})
	);
	if ("error" in result) return result;
	return { tags: result };
}

async function handleToggleFavorite(id: Id<"bookmarks">) {
	const client = getConvexClient();
	const result = await convexCall("toggle favorite", () =>
		client.mutation(api.bookmarks.toggleFavorite, { id })
	);
	if ("error" in result) return result;
	return result;
}

async function handleToggleReadLater(id: Id<"bookmarks">) {
	const client = getConvexClient();
	const result = await convexCall("toggle to-read", () =>
		client.mutation(api.bookmarks.toggleReadLater, { id })
	);
	if ("error" in result) return result;
	return result;
}

// ─── Settings handlers ─────────────────────────────

const SETTINGS_STORAGE_KEY = "glossUserSettings";
const SETTINGS_LAST_SYNC_KEY = "glossSettingsLastSync";
const SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const DEFAULT_SETTINGS: UserSettings = {
	profileVisibility: "public",
	highlightsVisibility: "friends",
	bookmarksVisibility: "public",
	highlightDisplayFilter: "friends",
	commentDisplayMode: "collapsed",
	themePreference: "system",
};

const THEME_STORAGE_KEY = "theme";

async function handleGetUserSettings(): Promise<
	{ settings: UserSettings } | { error: string }
> {
	try {
		const stored = await browser.storage.sync.get([
			SETTINGS_STORAGE_KEY,
			SETTINGS_LAST_SYNC_KEY,
		]);

		const lastSync = stored[SETTINGS_LAST_SYNC_KEY] as number | undefined;
		const cachedSettings = stored[SETTINGS_STORAGE_KEY] as
			| UserSettings
			| undefined;

		if (
			cachedSettings &&
			lastSync &&
			Date.now() - lastSync < SETTINGS_CACHE_TTL
		) {
			return { settings: cachedSettings };
		}

		return await handleSyncUserSettings();
	} catch {
		return { settings: DEFAULT_SETTINGS };
	}
}

async function handleSyncUserSettings(): Promise<
	{ settings: UserSettings } | { error: string }
> {
	const client = getConvexClient();
	const result = await convexCall("sync user settings", () =>
		client.query(api.users.getSettings)
	);

	if (result && "error" in result) {
		try {
			const stored = await browser.storage.sync.get(SETTINGS_STORAGE_KEY);
			const cachedSettings = stored[SETTINGS_STORAGE_KEY] as
				| UserSettings
				| undefined;
			if (cachedSettings) return { settings: cachedSettings };
		} catch {
			// Ignore storage errors
		}
		return { settings: DEFAULT_SETTINGS };
	}

	const settings = result ?? DEFAULT_SETTINGS;

	try {
		await browser.storage.sync.set({
			[SETTINGS_STORAGE_KEY]: settings,
			[SETTINGS_LAST_SYNC_KEY]: Date.now(),
			[THEME_STORAGE_KEY]: settings.themePreference,
		});
	} catch {
		// Ignore storage errors
	}

	return { settings };
}

async function handleUpdateThemePreference(
	themePreference: "light" | "dark" | "system"
): Promise<{ success: boolean } | { error: string }> {
	// Write local cache immediately so popup/content reflect the change even if offline.
	try {
		const stored = await browser.storage.sync.get(SETTINGS_STORAGE_KEY);
		const cached = stored[SETTINGS_STORAGE_KEY] as UserSettings | undefined;
		await browser.storage.sync.set({
			[THEME_STORAGE_KEY]: themePreference,
			[SETTINGS_STORAGE_KEY]: {
				...(cached ?? DEFAULT_SETTINGS),
				themePreference,
			},
		});
	} catch {
		// Ignore storage errors
	}

	const client = getConvexClient();
	const result = await convexCall("update theme preference", () =>
		client.mutation(api.users.updateSettings, { themePreference })
	);

	if ("error" in result) return result;
	return { success: true };
}
