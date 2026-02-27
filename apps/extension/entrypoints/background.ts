import type { Id } from "../../../convex/_generated/dataModel";
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

import { api, getConvexClient } from "../utils/api";

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
		handleMessage(msg)
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
		case "GET_FEED_HIGHLIGHTS":
			return await handleGetFeedHighlights(message.cursor, message.limit);
		case "GET_FEED_BOOKMARKS":
			return await handleGetFeedBookmarks(message.cursor, message.limit);
		case "GET_MY_BOOKMARKS":
			return await handleGetMyBookmarks(message.cursor, message.limit);
		case "SEARCH_DASHBOARD":
			return await handleSearchDashboard(message.query, message.limit);
		case "GET_USER_SETTINGS":
			return await handleGetUserSettings();
		case "SYNC_USER_SETTINGS":
			return await handleSyncUserSettings();
		default:
			return { error: "Unknown message type" };
	}
}

// ─── Highlight handlers ─────────────────────────────

async function handleLoadHighlights(
	url: string
): Promise<{ highlights: ServerHighlight[] } | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("load highlights", () =>
		client.query(api.highlights.getByUrl, { url })
	);

	if ("error" in result) return result;

	// Map Convex shape to extension's expected shape
	const highlights: ServerHighlight[] = (result as unknown[]).map((h: any) => ({
		id: h._id,
		userId: h.userId,
		url: h.url,
		urlHash: h.urlHash,
		selector: h.selector,
		text: h.text,
		visibility: h.visibility,
		createdAt: new Date(h._creationTime).toISOString(),
		user: h.user
			? { id: h.user._id, name: h.user.name, image: h.user.image }
			: undefined,
	}));

	console.log(`[Gloss] Loaded ${highlights.length} highlights for ${url}`);
	return { highlights };
}

async function handleCreateHighlight(message: {
	url: string;
	selector: ServerHighlight["selector"];
	text: string;
	visibility?: "public" | "friends" | "private";
}): Promise<{ highlight: ServerHighlight } | { error: string }> {
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

	// The mutation returns an ID — construct a minimal highlight object
	const id = result as string;
	const highlight: ServerHighlight = {
		id,
		userId: "",
		url: message.url,
		urlHash: "",
		selector: message.selector,
		text: message.text,
		visibility: message.visibility ?? "friends",
		createdAt: new Date().toISOString(),
	};

	console.log("[Gloss] Created highlight:", id);
	return { highlight };
}

async function handleUpdateHighlight(
	id: string,
	updates: { visibility?: "public" | "friends" | "private" }
): Promise<{ highlight: ServerHighlight } | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("update highlight", () =>
		client.mutation(api.highlights.update, {
			id: id as Id<"highlights">,
			visibility: updates.visibility,
		})
	);

	if ("error" in result) return result;

	return {
		highlight: {
			id,
			visibility: updates.visibility ?? "friends",
		} as ServerHighlight,
	};
}

async function handleDeleteHighlight(
	id: string
): Promise<{ success: boolean } | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("delete highlight", () =>
		client.mutation(api.highlights.remove, { id: id as Id<"highlights"> })
	);

	if ("error" in result) return result;

	console.log("[Gloss] Deleted highlight:", id);
	return { success: true };
}

async function handleGetAuthStatus(): Promise<{
	authenticated: boolean;
	user?: { id: string; name: string | null };
}> {
	try {
		// Check if we have a stored auth token
		const stored = await browser.storage.sync.get("glossAuthToken");
		if (!stored.glossAuthToken) {
			return { authenticated: false };
		}

		// Try to query the current user to verify the token
		const client = getConvexClient();
		const user = await client.query(api.users.getMe);

		if (user) {
			return {
				authenticated: true,
				user: { id: user._id, name: user.name },
			};
		}

		return { authenticated: false };
	} catch {
		return { authenticated: false };
	}
}

async function handleGetRecentHighlights(
	limit = 5
): Promise<{ highlights: ServerHighlight[] } | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("get recent highlights", () =>
		client.query(api.highlights.listMine, {
			paginationOpts: { numItems: limit, cursor: null },
		})
	);

	if ("error" in result) return result;

	const page = (result as any).page ?? [];
	const highlights: ServerHighlight[] = page.map((h: any) => ({
		id: h._id,
		userId: h.userId,
		url: h.url,
		urlHash: h.urlHash,
		selector: h.selector,
		text: h.text,
		visibility: h.visibility,
		createdAt: new Date(h._creationTime).toISOString(),
	}));

	return { highlights };
}

// ─── Comment handlers ─────────────────────────────

async function handleLoadComments(
	highlightId: string
): Promise<{ comments: any[] } | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("load comments", () =>
		client.query(api.comments.getForHighlight, {
			highlightId: highlightId as Id<"highlights">,
		})
	);

	if ("error" in result) return result;

	const comments = (result as any[]).map((c: any) => ({
		id: c._id,
		highlightId: c.highlightId,
		authorId: c.authorId,
		parentId: c.parentId ?? null,
		content: c.content,
		createdAt: new Date(c._creationTime).toISOString(),
		updatedAt: c.updatedAt
			? new Date(c.updatedAt).toISOString()
			: new Date(c._creationTime).toISOString(),
		author: c.author
			? { id: c.author._id, name: c.author.name, image: c.author.image }
			: { id: c.authorId, name: null, image: null },
		mentions: (c.mentions ?? []).map((m: any) => ({
			mentionedUser: { id: m._id, name: m.name },
		})),
	}));

	return { comments };
}

async function handleCreateComment(message: {
	highlightId: string;
	content: string;
	mentions: string[];
	parentId?: string;
}): Promise<{ comment: any } | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("create comment", () =>
		client.mutation(api.comments.create, {
			highlightId: message.highlightId as Id<"highlights">,
			content: message.content,
			mentionedUserIds: message.mentions as Id<"users">[],
			parentId: message.parentId as Id<"comments"> | undefined,
		})
	);

	if ("error" in result) return result;

	return {
		comment: {
			id: result as string,
			highlightId: message.highlightId,
			content: message.content,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			author: { id: "", name: null, image: null },
			mentions: [],
		},
	};
}

async function handleUpdateComment(message: {
	id: string;
	content: string;
	mentions: string[];
}): Promise<{ comment: any } | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("update comment", () =>
		client.mutation(api.comments.update, {
			id: message.id as Id<"comments">,
			content: message.content,
			mentionedUserIds: message.mentions as Id<"users">[],
		})
	);

	if ("error" in result) return result;

	return {
		comment: {
			id: message.id,
			content: message.content,
			updatedAt: new Date().toISOString(),
		},
	};
}

async function handleDeleteComment(
	id: string
): Promise<{ success: boolean } | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("delete comment", () =>
		client.mutation(api.comments.remove, { id: id as Id<"comments"> })
	);

	if ("error" in result) return result;
	return { success: true };
}

async function handleSearchFriends(
	query: string
): Promise<{ friends: any[] } | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("search friends", () =>
		client.query(api.friendships.searchFriends, { q: query })
	);

	if ("error" in result) return result;

	const friends = (result as any[]).map((f: any) => ({
		id: f._id,
		name: f.name,
		image: f.image ?? null,
	}));

	return { friends };
}

async function handleLoadPageCommentSummary(highlightIds: string[]) {
	if (highlightIds.length === 0) {
		return { highlightComments: [], totalComments: 0, commenters: [] };
	}

	const client = getConvexClient();
	const highlightComments: Array<{ highlightId: string; comments: any[] }> = [];
	const commenterMap = new Map<string, any>();
	let totalComments = 0;

	const results = await Promise.allSettled(
		highlightIds.map(async (highlightId) => {
			const comments = await client.query(api.comments.getForHighlight, {
				highlightId: highlightId as Id<"highlights">,
			});
			return { highlightId, comments };
		})
	);

	for (const settledResult of results) {
		if (settledResult.status === "rejected") continue;
		const { highlightId, comments } = settledResult.value;
		if (comments.length > 0) {
			const mapped = comments.map((c: any) => ({
				id: c._id,
				highlightId: c.highlightId,
				authorId: c.authorId,
				parentId: c.parentId ?? null,
				content: c.content,
				createdAt: new Date(c._creationTime).toISOString(),
				updatedAt: c.updatedAt
					? new Date(c.updatedAt).toISOString()
					: new Date(c._creationTime).toISOString(),
				author: c.author
					? { id: c.author._id, name: c.author.name, image: c.author.image }
					: { id: c.authorId, name: null, image: null },
				mentions: [],
			}));
			highlightComments.push({ highlightId, comments: mapped });
			totalComments += mapped.length;

			for (const c of mapped) {
				if (!commenterMap.has(c.authorId)) {
					commenterMap.set(c.authorId, c.author);
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

	if ("error" in result) return result;

	if (result) {
		const b = result as any;
		return {
			bookmarked: true as const,
			bookmark: {
				id: b._id,
				userId: b.userId,
				url: b.url,
				urlHash: b.urlHash,
				title: b.title ?? null,
				description: b.description ?? null,
				favicon: b.favicon ?? null,
				ogImage: b.ogImage ?? null,
				ogDescription: b.ogDescription ?? null,
				siteName: b.siteName ?? null,
				createdAt: new Date(b._creationTime).toISOString(),
				tags: [],
			},
		};
	}

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

	return {
		bookmark: {
			id: result as string,
			userId: "",
			url: message.url,
			urlHash: "",
			title: message.title ?? null,
			description: null,
			favicon: message.favicon ?? null,
			ogImage: message.ogImage ?? null,
			ogDescription: message.ogDescription ?? null,
			siteName: message.siteName ?? null,
			createdAt: new Date().toISOString(),
			tags: [],
		},
	};
}

async function handleUpdateBookmark(message: {
	id: string;
	title?: string;
	description?: string;
	tags?: string[];
}) {
	const client = getConvexClient();
	const result = await convexCall("update bookmark", () =>
		client.mutation(api.bookmarks.update, {
			id: message.id as Id<"bookmarks">,
			title: message.title,
			description: message.description,
			tags: message.tags,
		})
	);

	if ("error" in result) return result;

	return { bookmark: { id: message.id } as any };
}

async function handleDeleteBookmark(
	id: string
): Promise<{ success: boolean } | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("delete bookmark", () =>
		client.mutation(api.bookmarks.remove, { id: id as Id<"bookmarks"> })
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

	const tags = (result as any[]).map((t: any) => ({
		id: t._id,
		name: t.name,
		color: t.color ?? null,
		isSystem: t.isSystem,
	}));

	return { tags };
}

async function handleToggleFavorite(id: string) {
	const client = getConvexClient();
	const result = await convexCall("toggle favorite", () =>
		client.mutation(api.bookmarks.toggleFavorite, { id: id as Id<"bookmarks"> })
	);

	if ("error" in result) return result;

	const r = result as { added: boolean };
	return { favorited: r.added, bookmark: {} as any };
}

async function handleToggleReadLater(id: string) {
	const client = getConvexClient();
	const result = await convexCall("toggle to-read", () =>
		client.mutation(api.bookmarks.toggleReadLater, {
			id: id as Id<"bookmarks">,
		})
	);

	if ("error" in result) return result;

	const r = result as { added: boolean };
	return { toRead: r.added, bookmark: {} as any };
}

// ─── Dashboard handlers ─────────────────────────────

const DEFAULT_LIMIT = 20;

async function handleGetFeedHighlights(
	_cursor?: string,
	limit?: number
): Promise<PaginatedResponse<FeedHighlight> | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("get feed highlights", () =>
		client.query(api.feed.feedHighlights, {
			paginationOpts: { numItems: limit ?? DEFAULT_LIMIT },
		})
	);

	if ("error" in result) return result;

	const data = result as any;
	const items: FeedHighlight[] = (data.page ?? []).map((h: any) => ({
		id: h._id,
		url: h.url,
		text: h.text,
		note: null,
		color: "#fbbf24",
		createdAt: new Date(h._creationTime).toISOString(),
		user: h.user
			? { id: h.user._id, name: h.user.name, image: h.user.image }
			: { id: "", name: "", image: null },
	}));

	return { items, nextCursor: null };
}

async function handleGetFeedBookmarks(
	_cursor?: string,
	limit?: number
): Promise<PaginatedResponse<FeedBookmark> | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("get feed bookmarks", () =>
		client.query(api.feed.feedBookmarks, {
			paginationOpts: { numItems: limit ?? DEFAULT_LIMIT },
		})
	);

	if ("error" in result) return result;

	const data = result as any;
	const items: FeedBookmark[] = (data.page ?? []).map((b: any) => ({
		id: b._id,
		url: b.url,
		title: b.title ?? null,
		description: b.description ?? null,
		createdAt: new Date(b._creationTime).toISOString(),
		user: b.user
			? { id: b.user._id, name: b.user.name, image: b.user.image }
			: { id: "", name: "", image: null },
	}));

	return { items, nextCursor: null };
}

async function handleGetMyBookmarks(
	_cursor?: string,
	limit?: number
): Promise<PaginatedResponse<DashboardBookmark> | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("get my bookmarks", () =>
		client.query(api.bookmarks.list, {
			paginationOpts: { numItems: limit ?? DEFAULT_LIMIT, cursor: null },
		})
	);

	if ("error" in result) return result;

	const data = result as any;
	const items: DashboardBookmark[] = (data.page ?? []).map((b: any) => ({
		id: b._id,
		url: b.url,
		title: b.title ?? null,
		description: b.description ?? null,
		createdAt: new Date(b._creationTime).toISOString(),
	}));

	return { items, nextCursor: null };
}

async function handleSearchDashboard(
	searchQuery: string,
	limit?: number
): Promise<SearchResults | { error: string }> {
	const client = getConvexClient();
	const result = await convexCall("search dashboard", () =>
		client.query(api.search.search, {
			q: searchQuery,
			limit: limit ?? DEFAULT_LIMIT,
		})
	);

	if ("error" in result) return result;

	const data = result as any;
	const results = data.results ?? [];

	return {
		bookmarks: results
			.filter((r: any) => r.entityType === "bookmark")
			.map((r: any) => ({
				id: r.entityId,
				url: r.url ?? "",
				title: r.content,
				description: null,
				createdAt: new Date(r.createdAt).toISOString(),
			})),
		highlights: results
			.filter((r: any) => r.entityType === "highlight")
			.map((r: any) => ({
				id: r.entityId,
				url: r.url ?? "",
				text: r.content,
				note: null,
				createdAt: new Date(r.createdAt).toISOString(),
			})),
	};
}

// ─── Settings handlers ─────────────────────────────

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
	{ settings: UserSettingsData } | { error: string }
> {
	const client = getConvexClient();
	const result = await convexCall("sync user settings", () =>
		client.query(api.users.getSettings)
	);

	if ("error" in result) {
		try {
			const stored = await browser.storage.sync.get(SETTINGS_STORAGE_KEY);
			const cachedSettings = stored[SETTINGS_STORAGE_KEY] as
				| UserSettingsData
				| undefined;
			if (cachedSettings) return { settings: cachedSettings };
		} catch {
			// Ignore storage errors
		}
		return { settings: DEFAULT_SETTINGS };
	}

	const settings = (result as UserSettingsData) ?? DEFAULT_SETTINGS;

	try {
		await browser.storage.sync.set({
			[SETTINGS_STORAGE_KEY]: settings,
			[SETTINGS_LAST_SYNC_KEY]: Date.now(),
		});
	} catch {
		// Ignore storage errors
	}

	return { settings };
}
