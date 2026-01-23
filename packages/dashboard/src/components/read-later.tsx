import { useMyBookmarks } from "../hooks/use-my-bookmarks";
import type { DashboardApiClient } from "../types";
import { BookmarkCard } from "./bookmark-card";
import { ReadLaterSkeleton } from "./skeleton-loaders";

interface ReadLaterProps {
	apiClient: DashboardApiClient;
	className?: string;
}

/**
 * Section showing user's own bookmarks for reading later.
 * Horizontal scrolling gallery of cards.
 */
export function ReadLater({ apiClient, className = "" }: ReadLaterProps) {
	const { data, isLoading, error } = useMyBookmarks({
		apiClient,
		limit: 10,
	});

	return (
		<section className={className}>
			<h2 className="mb-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
				Read later
			</h2>

			{isLoading && <ReadLaterSkeleton />}

			{error && (
				<div className="flex h-24 items-center justify-center rounded-xl border border-border border-dashed">
					<p className="text-muted-foreground text-sm">
						Unable to load bookmarks
					</p>
				</div>
			)}

			{data && data.items.length === 0 && (
				<div className="flex h-24 items-center justify-center rounded-xl border border-border border-dashed">
					<p className="text-muted-foreground text-sm">
						No bookmarks yet. Start saving pages to read later.
					</p>
				</div>
			)}

			{data && data.items.length > 0 && (
				<div className="-mx-6 flex gap-4 overflow-x-auto px-6 pb-2">
					{data.items.map((bookmark) => (
						<BookmarkCard bookmark={bookmark} key={bookmark.id} />
					))}
				</div>
			)}
		</section>
	);
}
