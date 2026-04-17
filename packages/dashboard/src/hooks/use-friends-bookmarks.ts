import { useQuery } from "@tanstack/react-query";

import type { FeedBookmarksPage } from "../types";

interface UseFriendsBookmarksOptions {
	fetcher: (limit: number) => Promise<FeedBookmarksPage>;
	limit?: number;
}

/**
 * Fetch friends' recent bookmarks for the "Recent links" section.
 */
export function useFriendsBookmarks({
	fetcher,
	limit = 10,
}: UseFriendsBookmarksOptions) {
	return useQuery({
		queryKey: ["feed", "bookmarks", { limit }],
		queryFn: () => fetcher(limit),
	});
}
