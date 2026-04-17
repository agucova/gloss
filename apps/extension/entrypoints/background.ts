import type { AnnotationSelector } from "@gloss/anchoring";

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
import {
	clearToken as clearCuriusToken,
	getStoredToken,
	handleLoadCuriusBridge,
	invalidateSocialCaches,
	markCuriusConnected,
} from "../utils/curius-bridge";
import {
	connectCuriusWithToken,
	runCuriusImport,
} from "../utils/curius-import";

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
		case "LOAD_CURIUS_BRIDGE":
			return await handleLoadCuriusBridge(message.url);
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
		case "CURIUS_GET_STATUS":
			return await handleCuriusGetStatus();
		case "CURIUS_START_CONNECT":
			return await handleCuriusStartConnect();
		case "CURIUS_DISCONNECT":
			return await handleCuriusDisconnect();
		case "CURIUS_RUN_IMPORT":
			return await handleCuriusRunImport();
		case "CURIUS_READ_TOKEN":
			// Content-script-bound; the background never answers this. Kept in
			// the switch purely so the exhaustive-check compiles.
			return { token: null };
		case "CURIUS_TOKEN_HEARTBEAT":
			return await handleCuriusTokenHeartbeat(message.token);
		default:
			return { error: "Unknown message type" };
	}
}

// ─── Curius handlers ────────────────────────────────

async function handleCuriusGetStatus() {
	const client = getConvexClient();
	return await convexCall("curius status", () =>
		client.query(api.curius.getConnectionStatus, {})
	);
}

/**
 * Orchestrate the credential-less Curius connect flow.
 *
 * The extension's content script owns DOM-level access to curius.app's
 * localStorage (the extension already matches `<all_urls>`). From the
 * background we:
 *   1. ask any live curius.app tabs for the token,
 *   2. if none has one, open a helper tab and wait for the user to sign in,
 *   3. on every navigation completion, re-ask the tab, and
 *   4. on first successful read, verify + persist via setCredentials and
 *      kick off the import.
 *
 * The user gesture in the popup/web UI is the sole trigger — no flags,
 * no polling. The connect listener is scoped to the in-flight attempt;
 * a second click replaces the first.
 */
let activeConnect: {
	helperTabId: number | null;
	listener: (tabId: number, info: chrome.tabs.TabChangeInfo) => void;
	timer: ReturnType<typeof setTimeout>;
} | null = null;

const CONNECT_TIMEOUT_MS = 5 * 60 * 1000;

async function readTokenFromTab(tabId: number): Promise<string | null> {
	try {
		const response = (await browser.tabs.sendMessage(tabId, {
			type: "CURIUS_READ_TOKEN",
		})) as { token?: string | null } | undefined;
		const token = response?.token;
		return typeof token === "string" && token.length > 0 ? token : null;
	} catch {
		// No receiver (content script not ready / disabled on this domain).
		return null;
	}
}

async function finishConnectWithToken(
	token: string,
	helperTabId: number | null
): Promise<boolean> {
	try {
		const creds = await connectCuriusWithToken(token);
		const client = getConvexClient();
		await client.mutation(api.curius.setCredentials, {
			token: creds.token,
			tokenExpiresAt: creds.tokenExpiresAt,
			curiusUserId: creds.curiusUserId,
			curiusUsername: creds.curiusUsername,
			firstName: creds.firstName,
			lastName: creds.lastName,
		});
		await markCuriusConnected();
		await invalidateSocialCaches();
		void runCuriusImport({ convexClient: client, token }).catch((err) => {
			console.warn("[Gloss] Curius import ended in error:", err);
		});
		if (helperTabId !== null) {
			try {
				await browser.tabs.remove(helperTabId);
			} catch {
				// Tab already closed or navigated away — no-op.
			}
		}
		return true;
	} catch (error) {
		console.error("[Gloss] Curius connect completion failed:", error);
		return false;
	}
}

function clearActiveConnect(): void {
	if (!activeConnect) return;
	clearTimeout(activeConnect.timer);
	try {
		browser.tabs.onUpdated.removeListener(activeConnect.listener);
	} catch {
		// ignore
	}
	activeConnect = null;
}

async function handleCuriusStartConnect(): Promise<
	| { started: true; mode: "already-connected" | "reading" | "opened-tab" }
	| { error: string }
> {
	try {
		// Replace any in-flight attempt with this one.
		clearActiveConnect();

		const existingTabs = await browser.tabs.query({
			url: ["*://curius.app/*", "*://*.curius.app/*"],
		});

		for (const tab of existingTabs) {
			if (typeof tab.id !== "number") continue;
			const token = await readTokenFromTab(tab.id);
			if (token) {
				const ok = await finishConnectWithToken(token, null);
				if (ok) return { started: true, mode: "already-connected" };
			}
		}

		// No existing tab yielded a token — open a helper tab and watch it.
		let helperTabId: number | null = null;
		if (existingTabs.length === 0) {
			const created = await browser.tabs.create({
				url: "https://curius.app",
				active: true,
			});
			helperTabId = typeof created.id === "number" ? created.id : null;
		}

		const listener = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
			if (info.status !== "complete") return;
			void (async () => {
				const token = await readTokenFromTab(tabId);
				if (!(token && activeConnect)) return;
				const helperId = activeConnect.helperTabId;
				clearActiveConnect();
				await finishConnectWithToken(token, helperId);
			})();
		};

		const timer = setTimeout(() => {
			console.log("[Gloss] Curius connect flow timed out");
			clearActiveConnect();
		}, CONNECT_TIMEOUT_MS);

		activeConnect = { helperTabId, listener, timer };
		browser.tabs.onUpdated.addListener(listener);

		return {
			started: true,
			mode: helperTabId !== null ? "opened-tab" : "reading",
		};
	} catch (error) {
		clearActiveConnect();
		console.error("[Gloss] Curius start connect failed:", error);
		return {
			error: error instanceof Error ? error.message : "Connect failed",
		};
	}
}

async function handleCuriusDisconnect() {
	try {
		const client = getConvexClient();
		await client.mutation(api.curius.disconnect, {});
		await clearCuriusToken();
		await invalidateSocialCaches();
		return { success: true };
	} catch (error) {
		console.error("[Gloss] Curius disconnect failed:", error);
		return {
			error: error instanceof Error ? error.message : "Disconnect failed",
		};
	}
}

/**
 * Opportunistic token refresh pushed from the content script whenever it
 * runs on curius.app AND the user has an active Curius connection. If the
 * caller's token differs from our stored one, we verify it against
 * `/api/user` and patch the Convex row. If the new token fails verification
 * we keep the old one — an invalid heartbeat is silently ignored.
 *
 * Rate-limited implicitly by the content-script trigger (one attempt per
 * curius.app page load) plus the no-op fast path for identical tokens.
 */
async function handleCuriusTokenHeartbeat(token: string) {
	try {
		if (!(typeof token === "string" && token.length > 0)) {
			return { accepted: false };
		}
		const stored = await getStoredToken();
		if (stored === token) {
			return { accepted: false };
		}
		const creds = await connectCuriusWithToken(token);
		const client = getConvexClient();
		await client.mutation(api.curius.setCredentials, {
			token: creds.token,
			tokenExpiresAt: creds.tokenExpiresAt,
			curiusUserId: creds.curiusUserId,
			curiusUsername: creds.curiusUsername,
			firstName: creds.firstName,
			lastName: creds.lastName,
		});
		await markCuriusConnected();
		await invalidateSocialCaches();
		console.log("[Gloss] Curius token refreshed via heartbeat");
		return { accepted: true };
	} catch (error) {
		// Don't surface errors — a stale/invalid heartbeat isn't user-facing.
		console.warn("[Gloss] Curius heartbeat ignored:", error);
		return { accepted: false };
	}
}

/**
 * Fire-and-forget import. Returns immediately with `started: true` so the
 * popup UI can close without aborting the run. Progress is observable via
 * the `getConnectionStatus` query.
 */
async function handleCuriusRunImport() {
	try {
		const stored = await browser.storage.sync.get("curius.token");
		const token = stored["curius.token"];
		if (typeof token !== "string" || token.length === 0) {
			return { error: "Not connected to Curius" };
		}

		const client = getConvexClient();
		void runCuriusImport({ convexClient: client, token }).catch((err) => {
			console.warn("[Gloss] Curius import ended in error:", err);
		});
		return { started: true };
	} catch (error) {
		console.error("[Gloss] Curius import failed to start:", error);
		return {
			error: error instanceof Error ? error.message : "Import failed",
		};
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
	selector: AnnotationSelector;
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
