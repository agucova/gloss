import type { AnnotationSelector } from "@gloss/anchoring";
import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PageMetadata } from "./metadata";

export type Highlight = NonNullable<
	FunctionReturnType<typeof api.highlights.getByUrl>[number]
>;
export type HighlightDoc = NonNullable<
	FunctionReturnType<typeof api.highlights.create>
>;
export type MyHighlight = FunctionReturnType<
	typeof api.highlights.listMine
>["page"][number];

export type Comment = FunctionReturnType<
	typeof api.comments.getForHighlight
>[number];
export type Mention = Comment["mentions"][number];

export type Bookmark = FunctionReturnType<typeof api.bookmarks.create>;
export type BookmarkStatus = FunctionReturnType<typeof api.bookmarks.checkUrl>;
export type Tag = FunctionReturnType<typeof api.bookmarks.listTags>[number];
export type MyBookmark = FunctionReturnType<
	typeof api.bookmarks.list
>["page"][number];

export type Friend = FunctionReturnType<
	typeof api.friendships.searchFriends
>[number];

export type FeedHighlightItem = FunctionReturnType<
	typeof api.feed.feedHighlights
>["page"][number];
export type FeedBookmarkItem = FunctionReturnType<
	typeof api.feed.feedBookmarks
>["page"][number];
export type FeedHighlightsPage = FunctionReturnType<
	typeof api.feed.feedHighlights
>;
export type FeedBookmarksPage = FunctionReturnType<
	typeof api.feed.feedBookmarks
>;
export type MyBookmarksPage = FunctionReturnType<typeof api.bookmarks.list>;
export type SearchResults = FunctionReturnType<typeof api.search.search>;
export type UserSettings = NonNullable<
	FunctionReturnType<typeof api.users.getSettings>
>;

export interface PageCommentSummary {
	highlightComments: Array<{
		highlightId: Id<"highlights">;
		comments: Comment[];
	}>;
	totalComments: number;
	commenters: Array<{
		_id: Id<"users">;
		name: string;
		image: string | undefined;
	}>;
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
			id: Id<"highlights">;
			updates: {
				visibility?: "public" | "friends" | "private";
			};
	  }
	| { type: "DELETE_HIGHLIGHT"; id: Id<"highlights"> }
	| { type: "GET_AUTH_STATUS" }
	| { type: "GET_RECENT_HIGHLIGHTS"; limit?: number }
	| { type: "LOAD_COMMENTS"; highlightId: Id<"highlights"> }
	| {
			type: "CREATE_COMMENT";
			highlightId: Id<"highlights">;
			content: string;
			mentions: Id<"users">[];
			parentId?: Id<"comments">;
	  }
	| {
			type: "UPDATE_COMMENT";
			id: Id<"comments">;
			content: string;
			mentions: Id<"users">[];
	  }
	| { type: "DELETE_COMMENT"; id: Id<"comments"> }
	| { type: "SEARCH_FRIENDS"; query: string }
	| { type: "LOAD_PAGE_COMMENT_SUMMARY"; highlightIds: Id<"highlights">[] }
	| { type: "GET_PAGE_METADATA"; tabId?: number }
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
			id: Id<"bookmarks">;
			title?: string;
			description?: string;
			tags?: string[];
	  }
	| { type: "DELETE_BOOKMARK"; id: Id<"bookmarks"> }
	| { type: "GET_USER_TAGS" }
	| { type: "TOGGLE_FAVORITE"; id: Id<"bookmarks"> }
	| { type: "TOGGLE_READ_LATER"; id: Id<"bookmarks"> }
	| { type: "GET_FEED_HIGHLIGHTS"; cursor?: string; limit?: number }
	| { type: "GET_FEED_BOOKMARKS"; cursor?: string; limit?: number }
	| { type: "GET_MY_BOOKMARKS"; cursor?: string; limit?: number }
	| { type: "SEARCH_DASHBOARD"; query: string; limit?: number }
	| { type: "GET_USER_SETTINGS" }
	| { type: "SYNC_USER_SETTINGS" }
	| {
			type: "UPDATE_THEME_PREFERENCE";
			themePreference: "light" | "dark" | "system";
	  };

type ErrorResponse = { error: string };

type MessageResponseMap = {
	LOAD_HIGHLIGHTS: { highlights: Highlight[] } | ErrorResponse;
	CREATE_HIGHLIGHT: { highlight: HighlightDoc } | ErrorResponse;
	UPDATE_HIGHLIGHT: { highlight: HighlightDoc } | ErrorResponse;
	DELETE_HIGHLIGHT: { success: boolean } | ErrorResponse;
	GET_AUTH_STATUS: {
		authenticated: boolean;
		user?: { _id: Id<"users">; name: string };
	};
	GET_RECENT_HIGHLIGHTS: { highlights: MyHighlight[] } | ErrorResponse;
	LOAD_COMMENTS: { comments: Comment[] } | ErrorResponse;
	CREATE_COMMENT: { comment: Comment } | ErrorResponse;
	UPDATE_COMMENT: { comment: Comment } | ErrorResponse;
	DELETE_COMMENT: { success: boolean } | ErrorResponse;
	SEARCH_FRIENDS: { friends: Friend[] } | ErrorResponse;
	LOAD_PAGE_COMMENT_SUMMARY: PageCommentSummary | ErrorResponse;
	GET_PAGE_METADATA: { metadata: PageMetadata };
	GET_BOOKMARK_STATUS:
		| { bookmarked: true; bookmark: NonNullable<BookmarkStatus> }
		| { bookmarked: false; bookmark: null }
		| ErrorResponse;
	SAVE_BOOKMARK: { bookmark: Bookmark } | ErrorResponse;
	UPDATE_BOOKMARK: { bookmark: Bookmark } | ErrorResponse;
	DELETE_BOOKMARK: { success: boolean } | ErrorResponse;
	GET_USER_TAGS: { tags: Tag[] } | ErrorResponse;
	TOGGLE_FAVORITE: { favorited: boolean; bookmark: Bookmark } | ErrorResponse;
	TOGGLE_READ_LATER: { toRead: boolean; bookmark: Bookmark } | ErrorResponse;
	GET_FEED_HIGHLIGHTS: FeedHighlightsPage | ErrorResponse;
	GET_FEED_BOOKMARKS: FeedBookmarksPage | ErrorResponse;
	GET_MY_BOOKMARKS: MyBookmarksPage | ErrorResponse;
	SEARCH_DASHBOARD: SearchResults | ErrorResponse;
	GET_USER_SETTINGS: { settings: UserSettings } | ErrorResponse;
	SYNC_USER_SETTINGS: { settings: UserSettings } | ErrorResponse;
	UPDATE_THEME_PREFERENCE: { success: boolean } | ErrorResponse;
};

export type MessageResponse<T extends Message["type"]> = MessageResponseMap[T];

/**
 * Type-safe message sending helper.
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
