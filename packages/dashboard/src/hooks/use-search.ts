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
 *
 * The API returns `{ results: HydratedResult[], meta }` where each result
 * has a `type` discriminator. We transform this into the `{ bookmarks, highlights }`
 * shape the dashboard components expect.
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

			// The API returns { results, meta } — transform to { bookmarks, highlights }
			const raw = data as {
				results?: Array<{
					type: string;
					id: string;
					url: string;
					title?: string | null;
					description?: string | null;
					text?: string;
					note?: string | null;
					createdAt: Date | string;
				}>;
				bookmarks?: SearchResults["bookmarks"];
				highlights?: SearchResults["highlights"];
			};

			// If already in the expected shape (e.g., from extension message handler)
			if (raw.bookmarks || raw.highlights) {
				return raw as SearchResults;
			}

			// Transform from API response shape
			const results = raw.results ?? [];
			return {
				bookmarks: results
					.filter((r) => r.type === "bookmark")
					.map((r) => ({
						id: r.id,
						url: r.url,
						title: r.title ?? null,
						description: r.description ?? null,
						createdAt: r.createdAt,
					})),
				highlights: results
					.filter((r) => r.type === "highlight")
					.map((r) => ({
						id: r.id,
						url: r.url,
						text: r.text ?? "",
						note: r.note ?? null,
						createdAt: r.createdAt,
					})),
			} satisfies SearchResults;
		},
		enabled: enabled && query.length > 0,
	});
}
