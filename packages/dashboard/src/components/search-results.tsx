/** @jsxImportSource react */
import { useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { formatRelativeTime } from "../utils/relative-time";

interface SearchResultsProps {
	query: string;
}

/**
 * Display search results for bookmarks and highlights.
 */
export function SearchResults({ query }: SearchResultsProps) {
	const data = useQuery(
		api.search.search,
		query.length > 0 ? { q: query, limit: 20 } : "skip"
	);

	if (data === undefined) {
		return (
			<div className="mt-12 text-center text-sm text-muted-foreground">
				Searching...
			</div>
		);
	}

	const bookmarks = data.results.filter((r) => r.entityType === "bookmark");
	const highlights = data.results.filter((r) => r.entityType === "highlight");
	const hasBookmarks = bookmarks.length > 0;
	const hasHighlights = highlights.length > 0;

	if (!(hasBookmarks || hasHighlights)) {
		return (
			<div className="mt-12 text-center text-sm text-muted-foreground">
				No results found for "{query}"
			</div>
		);
	}

	return (
		<div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-2">
			{hasBookmarks && (
				<section>
					<h2 className="mb-4 text-sm font-medium text-muted-foreground">
						Bookmarks
					</h2>
					<div className="space-y-3">
						{bookmarks.map((result) => (
							<a
								className="block rounded-lg border border-border/50 p-4 transition-colors hover:border-border hover:bg-muted/30"
								href={result.url ?? "#"}
								key={result.entityId}
								rel="noopener noreferrer"
								target="_blank"
							>
								<h3 className="text-sm font-medium text-foreground">
									{result.content}
								</h3>
								<span className="mt-2 block text-xs text-muted-foreground">
									{formatRelativeTime(result.createdAt)}
								</span>
							</a>
						))}
					</div>
				</section>
			)}

			{hasHighlights && (
				<section>
					<h2 className="mb-4 text-sm font-medium text-muted-foreground">
						Highlights
					</h2>
					<div className="space-y-3">
						{highlights.map((result) => (
							<a
								className="block rounded-lg bg-amber-50 p-4 transition-colors hover:bg-amber-100/80 dark:bg-amber-500/10 dark:hover:bg-amber-500/20"
								href={result.url ?? "#"}
								key={result.entityId}
								rel="noopener noreferrer"
								target="_blank"
							>
								<p className="text-sm leading-relaxed text-foreground">
									{result.content}
								</p>
								<span className="mt-2 block text-xs text-muted-foreground">
									{formatRelativeTime(result.createdAt)}
								</span>
							</a>
						))}
					</div>
				</section>
			)}
		</div>
	);
}
