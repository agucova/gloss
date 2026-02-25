import { useQuery } from "@tanstack/react-query";

import type { DashboardApiClient, FeedBookmark } from "../types";

interface UseFriendsBookmarksOptions {
	apiClient: DashboardApiClient;
	limit?: number;
}

/**
 * Fetch friends' recent bookmarks for the "Recent links" section.
 */
export function useFriendsBookmarks({
	apiClient,
	limit = 10,
}: UseFriendsBookmarksOptions) {
	return useQuery({
		queryKey: ["feed", "bookmarks", { limit }],
		queryFn: async () => {
			const { data, error } = await apiClient.api.feed.bookmarks.get({
				query: { limit },
			});
			if (error) {
				throw new Error("Failed to fetch friends' bookmarks");
			}
			return data as { items: FeedBookmark[]; nextCursor: string | null };
		},
	});
}
