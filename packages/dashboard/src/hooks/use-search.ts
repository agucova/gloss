import { useQuery } from "@tanstack/react-query";

import type { SearchResults } from "../types";

interface UseSearchOptions {
	fetcher: (query: string, limit: number) => Promise<SearchResults>;
	query: string;
	limit?: number;
	enabled?: boolean;
}

/**
 * Search user's bookmarks and highlights.
 */
export function useSearch({
	fetcher,
	query,
	limit = 20,
	enabled = true,
}: UseSearchOptions) {
	return useQuery({
		queryKey: ["search", query, { limit }],
		queryFn: () => fetcher(query, limit),
		enabled: enabled && query.length > 0,
	});
}
