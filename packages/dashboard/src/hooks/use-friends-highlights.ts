import { useQuery } from "@tanstack/react-query";

import type { FeedHighlightsPage } from "../types";

interface UseFriendsHighlightsOptions {
	fetcher: (limit: number) => Promise<FeedHighlightsPage>;
	limit?: number;
}

/**
 * Fetch friends' recent highlights for the "Recent highlights" section.
 */
export function useFriendsHighlights({
	fetcher,
	limit = 10,
}: UseFriendsHighlightsOptions) {
	return useQuery({
		queryKey: ["feed", "highlights", { limit }],
		queryFn: () => fetcher(limit),
	});
}
