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
 * Bridged items come from Curius via `api.curius.getFriendFeed`. Structurally
 * compatible with `FeedHighlight` / `FeedBookmark` for rendering — the only
 * differences at the type level are that synthetic `_id`s are plain strings
 * (not `Id<"highlights">`) and `source === "curius"` marks the origin.
 */
export interface CuriusBridgeHighlight {
	_id: string;
	_creationTime: number;
	url: string;
	text: string;
	user: {
		_id: string;
		name: string;
		image?: string;
		username?: string;
	};
	source: "curius";
	externalId: string;
}

export interface CuriusBridgeBookmark {
	_id: string;
	_creationTime: number;
	url: string;
	title?: string;
	user: {
		_id: string;
		name: string;
		image?: string;
		username?: string;
	};
	source: "curius";
	externalId: string;
}

/**
 * Unions consumed by the dashboard's section components after merging.
 * Native items may carry an `externalId` (from Curius imports) which is how
 * we dedup against bridged copies of the same source highlight.
 */
export type MergedFeedHighlight =
	| (FeedHighlight & { source?: "gloss" })
	| CuriusBridgeHighlight;

export type MergedFeedBookmark =
	| (FeedBookmark & { source?: "gloss" })
	| CuriusBridgeBookmark;
