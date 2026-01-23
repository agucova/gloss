import { useSearch } from "../hooks/use-search";
import type { DashboardApiClient } from "../types";
import { formatRelativeTime } from "../utils/relative-time";

interface SearchResultsProps {
	apiClient: DashboardApiClient;
	query: string;
}

/**
 * Display search results for bookmarks and highlights.
 */
export function SearchResults({ apiClient, query }: SearchResultsProps) {
	const { data, isLoading, error } = useSearch({
		apiClient,
		query,
		enabled: query.length > 0,
	});

	if (isLoading) {
		return (
			<div className="mt-12 text-center text-muted-foreground text-sm">
				Searching...
			</div>
		);
	}

	if (error) {
		return (
			<div className="mt-12 text-center text-muted-foreground text-sm">
				Unable to search
			</div>
		);
	}

	if (!data) {
		return null;
	}

	const hasBookmarks = data.bookmarks.length > 0;
	const hasHighlights = data.highlights.length > 0;
	const hasResults = hasBookmarks || hasHighlights;

	if (!hasResults) {
		return (
			<div className="mt-12 text-center text-muted-foreground text-sm">
				No results found for "{query}"
			</div>
		);
	}

	return (
		<div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-2">
			{hasBookmarks && (
				<section>
					<h2 className="mb-4 font-medium text-muted-foreground text-sm">
						Bookmarks
					</h2>
					<div className="space-y-3">
						{data.bookmarks.map((bookmark) => (
							<a
								className="block rounded-lg border border-border/50 p-4 transition-colors hover:border-border hover:bg-muted/30"
								href={bookmark.url}
								key={bookmark.id}
								rel="noopener noreferrer"
								target="_blank"
							>
								<h3 className="font-medium text-foreground text-sm">
									{bookmark.title || bookmark.url}
								</h3>
								{bookmark.description && (
									<p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
										{bookmark.description}
									</p>
								)}
								<span className="mt-2 block text-muted-foreground text-xs">
									{formatRelativeTime(bookmark.createdAt)}
								</span>
							</a>
						))}
					</div>
				</section>
			)}

			{hasHighlights && (
				<section>
					<h2 className="mb-4 font-medium text-muted-foreground text-sm">
						Highlights
					</h2>
					<div className="space-y-3">
						{data.highlights.map((highlight) => (
							<a
								className="block rounded-lg bg-amber-50 p-4 transition-colors hover:bg-amber-100/80 dark:bg-amber-500/10 dark:hover:bg-amber-500/20"
								href={highlight.url}
								key={highlight.id}
								rel="noopener noreferrer"
								target="_blank"
							>
								<p className="text-foreground text-sm leading-relaxed">
									{highlight.text}
								</p>
								{highlight.note && (
									<p className="mt-2 text-muted-foreground text-xs italic">
										{highlight.note}
									</p>
								)}
								<span className="mt-2 block text-muted-foreground text-xs">
									{formatRelativeTime(highlight.createdAt)}
								</span>
							</a>
						))}
					</div>
				</section>
			)}
		</div>
	);
}
