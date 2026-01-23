import { useQuery } from "@tanstack/react-query";
import type { DashboardApiClient, FeedHighlight } from "../types";

interface UseFriendsHighlightsOptions {
	apiClient: DashboardApiClient;
	limit?: number;
}

/**
 * Fetch friends' recent highlights for the "Recent highlights" section.
 */
export function useFriendsHighlights({
	apiClient,
	limit = 10,
}: UseFriendsHighlightsOptions) {
	return useQuery({
		queryKey: ["feed", "highlights", { limit }],
		queryFn: async () => {
			const { data, error } = await apiClient.api.feed.get({
				query: { limit },
			});
			if (error) {
				throw new Error("Failed to fetch friends' highlights");
			}
			return data as { items: FeedHighlight[]; nextCursor: string | null };
		},
	});
}
