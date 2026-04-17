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
