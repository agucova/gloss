import { useQuery } from "@tanstack/react-query";

import type { Bookmark, DashboardApiClient } from "../types";

interface UseMyBookmarksOptions {
	apiClient: DashboardApiClient;
	limit?: number;
}

/**
 * Fetch user's own bookmarks for the "Read later" section.
 */
export function useMyBookmarks({
	apiClient,
	limit = 10,
}: UseMyBookmarksOptions) {
	return useQuery({
		queryKey: ["bookmarks", "mine", { limit }],
		queryFn: async () => {
			const { data, error } = await apiClient.api.bookmarks.get({
				query: { limit },
			});
			if (error) {
				throw new Error("Failed to fetch bookmarks");
			}
			return data as { items: Bookmark[]; nextCursor: string | null };
		},
	});
}
