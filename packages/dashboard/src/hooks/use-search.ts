import { useQuery } from "@tanstack/react-query";
import type { DashboardApiClient, SearchResults } from "../types";

interface UseSearchOptions {
	apiClient: DashboardApiClient;
	query: string;
	limit?: number;
	enabled?: boolean;
}

/**
 * Search user's bookmarks and highlights.
 */
export function useSearch({
	apiClient,
	query,
	limit = 20,
	enabled = true,
}: UseSearchOptions) {
	return useQuery({
		queryKey: ["search", query, { limit }],
		queryFn: async () => {
			const { data, error } = await apiClient.api.search.get({
				query: { q: query, limit },
			});
			if (error) {
				throw new Error("Search failed");
			}
			return data as SearchResults;
		},
		enabled: enabled && query.length > 0,
	});
}
