import { MoreHorizontal } from "lucide-react";

import type { DashboardApiClient } from "../types";

import { useMyBookmarks } from "../hooks/use-my-bookmarks";
import { BookmarkCard } from "./bookmark-card";
import { ReadLaterSkeleton } from "./skeleton-loaders";

interface ReadLaterProps {
	apiClient: DashboardApiClient;
	className?: string;
}

const MAX_VISIBLE_CARDS = 4;

/**
 * Section showing user's own bookmarks for reading later.
 * Shows limited cards with a "+N more" overflow card.
 */
export function ReadLater({ apiClient, className = "" }: ReadLaterProps) {
	const { data, isLoading, error } = useMyBookmarks({
		apiClient,
		limit: 20,
	});

	const items = data?.items ?? [];
	const visibleItems = items.slice(0, MAX_VISIBLE_CARDS);
	const remainingCount = Math.max(0, items.length - MAX_VISIBLE_CARDS);

	return (
		<section className={className}>
			<h2 className="mb-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">
				Read later
			</h2>

			{isLoading && <ReadLaterSkeleton />}

			{error && (
				<div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border">
					<p className="text-sm text-muted-foreground">
						Unable to load bookmarks
					</p>
				</div>
			)}

			{data && items.length === 0 && (
				<div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border">
					<p className="text-sm text-muted-foreground">
						No bookmarks yet. Start saving pages to read later.
					</p>
				</div>
			)}

			{data && items.length > 0 && (
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{visibleItems.map((bookmark) => (
						<BookmarkCard bookmark={bookmark} key={bookmark.id} />
					))}
					{remainingCount > 0 && (
						<a
							className="flex min-h-[88px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center transition-colors hover:bg-muted/50"
							href="/read-later"
						>
							<MoreHorizontal className="mb-1.5 size-5 text-muted-foreground/60" />
							<span className="text-sm font-medium text-muted-foreground">
								+{remainingCount} more
							</span>
						</a>
					)}
				</div>
			)}
		</section>
	);
}
