import type { AnnotationSelector } from "@gloss/anchoring";

/**
 * Server-returned highlight shape (from API response).
 * Matches the shape returned by GET /api/highlights
 */
export interface ServerHighlight {
	id: string;
	userId: string;
	url: string;
	urlHash: string;
	selector: AnnotationSelector;
	text: string;
	visibility: "public" | "friends" | "private";
	createdAt: string;
	user?: {
		id: string;
		name: string | null;
		image: string | null;
	};
}

/**
 * Server-returned comment shape (from API response).
 */
export interface ServerComment {
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
 * Friend for @mention autocomplete.
 */
export interface Friend {
	id: string;
	name: string | null;
	image: string | null;
}

/**
 * Comment summary for a highlight (used for margin annotations).
 */
export interface HighlightCommentSummary {
	highlightId: string;
	comments: ServerComment[];
}

/**
 * Tag shape from the server.
 */
export interface ServerTag {
	id: string;
	name: string;
	color: string | null;
	isSystem: boolean;
}

/**
 * Bookmark shape from the server.
 */
export interface ServerBookmark {
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
	tags: ServerTag[];
}

/**
 * Page comment summary response (aggregated comment data for all highlights on a page).
 */
export interface PageCommentSummary {
	highlightComments: HighlightCommentSummary[];
	totalComments: number;
	commenters: Array<{
		id: string;
		name: string | null;
		image: string | null;
	}>;
}

/**
 * Page metadata extracted from a webpage.
 */
export interface PageMetadata {
	title: string;
	url: string;
	favicon: string | null;
	ogImage: string | null;
	ogDescription: string | null;
	siteName: string | null;
}

// ============================================================================
// Dashboard types (for newtab)
// ============================================================================

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
	createdAt: string;
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
	createdAt: string;
	user: FeedUser;
}

/**
 * User's own bookmark for dashboard.
 */
export interface DashboardBookmark {
	id: string;
	url: string;
	title: string | null;
	description: string | null;
	createdAt: string;
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
	bookmarks: DashboardBookmark[];
	highlights: {
		id: string;
		url: string;
		text: string;
		note: string | null;
		createdAt: string;
	}[];
}

/**
 * User settings (synced from server).
 */
export interface UserSettings {
	profileVisibility: "public" | "friends" | "private";
	highlightsVisibility: "public" | "friends" | "private";
	bookmarksVisibility: "public" | "friends" | "private";
	highlightDisplayFilter: "anyone" | "friends" | "me";
	commentDisplayMode: "expanded" | "collapsed";
}

/**
 * Message types for content ↔ background communication.
 */
export type Message =
	| { type: "LOAD_HIGHLIGHTS"; url: string }
	| {
			type: "CREATE_HIGHLIGHT";
			url: string;
			selector: AnnotationSelector;
			text: string;
			visibility?: "public" | "friends" | "private";
	  }
	| {
			type: "UPDATE_HIGHLIGHT";
			id: string;
			updates: {
				visibility?: "public" | "friends" | "private";
			};
	  }
	| { type: "DELETE_HIGHLIGHT"; id: string }
	| { type: "GET_AUTH_STATUS" }
	| { type: "GET_RECENT_HIGHLIGHTS"; limit?: number }
	// Comment messages
	| { type: "LOAD_COMMENTS"; highlightId: string }
	| {
			type: "CREATE_COMMENT";
			highlightId: string;
			content: string;
			mentions: string[];
			parentId?: string;
	  }
	| {
			type: "UPDATE_COMMENT";
			id: string;
			content: string;
			mentions: string[];
	  }
	| { type: "DELETE_COMMENT"; id: string }
	| { type: "SEARCH_FRIENDS"; query: string }
	| { type: "LOAD_PAGE_COMMENT_SUMMARY"; highlightIds: string[] }
	// Bookmark messages
	| { type: "GET_PAGE_METADATA" }
	| { type: "GET_BOOKMARK_STATUS"; url: string }
	| {
			type: "SAVE_BOOKMARK";
			url: string;
			title?: string;
			favicon?: string;
			ogImage?: string;
			ogDescription?: string;
			siteName?: string;
			tags?: string[];
	  }
	| {
			type: "UPDATE_BOOKMARK";
			id: string;
			title?: string;
			description?: string;
			tags?: string[];
	  }
	| { type: "DELETE_BOOKMARK"; id: string }
	| { type: "GET_USER_TAGS" }
	| { type: "TOGGLE_FAVORITE"; id: string }
	| { type: "TOGGLE_READ_LATER"; id: string }
	// Dashboard messages (for newtab)
	| { type: "GET_FEED_HIGHLIGHTS"; cursor?: string; limit?: number }
	| { type: "GET_FEED_BOOKMARKS"; cursor?: string; limit?: number }
	| { type: "GET_MY_BOOKMARKS"; cursor?: string; limit?: number }
	| { type: "SEARCH_DASHBOARD"; query: string; limit?: number }
	// Settings messages
	| { type: "GET_USER_SETTINGS" }
	| { type: "SYNC_USER_SETTINGS" };

/**
 * Response types mapped to each message type.
 */
export type MessageResponse<T extends Message["type"]> =
	T extends "LOAD_HIGHLIGHTS"
		? { highlights: ServerHighlight[] } | { error: string }
		: T extends "CREATE_HIGHLIGHT"
			? { highlight: ServerHighlight } | { error: string }
			: T extends "UPDATE_HIGHLIGHT"
				? { highlight: ServerHighlight } | { error: string }
				: T extends "DELETE_HIGHLIGHT"
					? { success: boolean } | { error: string }
					: T extends "GET_AUTH_STATUS"
						? {
								authenticated: boolean;
								user?: { id: string; name: string | null };
							}
						: T extends "GET_RECENT_HIGHLIGHTS"
							? { highlights: ServerHighlight[] } | { error: string }
							: T extends "LOAD_COMMENTS"
								? { comments: ServerComment[] } | { error: string }
								: T extends "CREATE_COMMENT"
									? { comment: ServerComment } | { error: string }
									: T extends "UPDATE_COMMENT"
										? { comment: ServerComment } | { error: string }
										: T extends "DELETE_COMMENT"
											? { success: boolean } | { error: string }
											: T extends "SEARCH_FRIENDS"
												? { friends: Friend[] } | { error: string }
												: T extends "LOAD_PAGE_COMMENT_SUMMARY"
													? PageCommentSummary | { error: string }
													: T extends "GET_PAGE_METADATA"
														? { metadata: PageMetadata }
														: T extends "GET_BOOKMARK_STATUS"
															?
																	| {
																			bookmarked: true;
																			bookmark: ServerBookmark;
																	  }
																	| { bookmarked: false; bookmark: null }
																	| { error: string }
															: T extends "SAVE_BOOKMARK"
																?
																		| { bookmark: ServerBookmark }
																		| { error: string }
																: T extends "UPDATE_BOOKMARK"
																	?
																			| { bookmark: ServerBookmark }
																			| { error: string }
																	: T extends "DELETE_BOOKMARK"
																		? { success: boolean } | { error: string }
																		: T extends "GET_USER_TAGS"
																			?
																					| { tags: ServerTag[] }
																					| { error: string }
																			: T extends "TOGGLE_FAVORITE"
																				?
																						| {
																								favorited: boolean;
																								bookmark: ServerBookmark;
																						  }
																						| { error: string }
																				: T extends "TOGGLE_READ_LATER"
																					?
																							| {
																									toRead: boolean;
																									bookmark: ServerBookmark;
																							  }
																							| { error: string }
																					: T extends "GET_FEED_HIGHLIGHTS"
																						?
																								| PaginatedResponse<FeedHighlight>
																								| { error: string }
																						: T extends "GET_FEED_BOOKMARKS"
																							?
																									| PaginatedResponse<FeedBookmark>
																									| { error: string }
																							: T extends "GET_MY_BOOKMARKS"
																								?
																										| PaginatedResponse<DashboardBookmark>
																										| { error: string }
																								: T extends "SEARCH_DASHBOARD"
																									?
																											| SearchResults
																											| { error: string }
																									: T extends "GET_USER_SETTINGS"
																										?
																												| {
																														settings: UserSettings;
																												  }
																												| { error: string }
																										: T extends "SYNC_USER_SETTINGS"
																											?
																													| {
																															settings: UserSettings;
																													  }
																													| { error: string }
																											: never;

/**
 * Type-safe message sending helper.
 * Use this in content scripts to communicate with the background script.
 */
export async function sendMessage<T extends Message>(
	message: T
): Promise<MessageResponse<T["type"]>> {
	return await browser.runtime.sendMessage(message);
}

/**
 * Type guard for checking if a response is an error.
 */
export function isErrorResponse(
	response: { error: string } | unknown
): response is { error: string } {
	return (
		typeof response === "object" &&
		response !== null &&
		"error" in response &&
		typeof (response as { error: unknown }).error === "string"
	);
}
