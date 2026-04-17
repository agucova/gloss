import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";

export type FeedHighlight = FunctionReturnType<
	typeof api.feed.feedHighlights
>["page"][number];
export type FeedBookmark = FunctionReturnType<
	typeof api.feed.feedBookmarks
>["page"][number];
export type MyBookmark = FunctionReturnType<
	typeof api.bookmarks.list
>["page"][number];
export type FeedHighlightsPage = FunctionReturnType<
	typeof api.feed.feedHighlights
>;
export type FeedBookmarksPage = FunctionReturnType<
	typeof api.feed.feedBookmarks
>;
export type MyBookmarksPage = FunctionReturnType<typeof api.bookmarks.list>;
export type SearchResults = FunctionReturnType<typeof api.search.search>;

/**
 * Fetchers supplied by the host app. The dashboard package calls these from
 * React Query hooks; the host is responsible for routing the call to Convex
 * (directly, through a message bridge, etc.).
 */
export interface DashboardFetchers {
	fetchFeedHighlights(limit: number): Promise<FeedHighlightsPage>;
	fetchFeedBookmarks(limit: number): Promise<FeedBookmarksPage>;
	fetchMyBookmarks(limit: number): Promise<MyBookmarksPage>;
	fetchSearch(query: string, limit: number): Promise<SearchResults>;
}
