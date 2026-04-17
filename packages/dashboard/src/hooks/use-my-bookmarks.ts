import { useQuery } from "@tanstack/react-query";

import type { MyBookmarksPage } from "../types";

interface UseMyBookmarksOptions {
	fetcher: (limit: number) => Promise<MyBookmarksPage>;
	limit?: number;
}

/**
 * Fetch user's own bookmarks for the "Read later" section.
 */
export function useMyBookmarks({ fetcher, limit = 10 }: UseMyBookmarksOptions) {
	return useQuery({
		queryKey: ["bookmarks", "mine", { limit }],
		queryFn: () => fetcher(limit),
	});
}
