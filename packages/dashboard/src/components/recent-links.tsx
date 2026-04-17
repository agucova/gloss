/** @jsxImportSource react */
import type { FeedBookmarksPage } from "../types";

import { useFriendsBookmarks } from "../hooks/use-friends-bookmarks";
import { FriendActivityItem } from "./friend-activity-item";
import { RecentLinksSkeleton } from "./skeleton-loaders";

interface RecentLinksProps {
	fetcher: (limit: number) => Promise<FeedBookmarksPage>;
	className?: string;
}

/**
 * Section showing friends' recent bookmarks/links.
 */
export function RecentLinks({ fetcher, className = "" }: RecentLinksProps) {
	const { data, isLoading, error } = useFriendsBookmarks({
		fetcher,
		limit: 8,
	});

	const items = data?.page ?? [];

	return (
		<section className={className}>
			<h2 className="mb-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">
				Recent bookmarks
			</h2>

			<div className="min-h-32 rounded-xl border border-border bg-card px-4 py-1.5">
				{isLoading && <RecentLinksSkeleton />}

				{error && (
					<div className="flex h-24 items-center justify-center">
						<p className="text-sm text-muted-foreground">
							Unable to load recent bookmarks
						</p>
					</div>
				)}

				{data && items.length === 0 && (
					<div className="flex h-24 items-center justify-center">
						<p className="text-sm text-muted-foreground">
							No recent bookmarks from friends yet
						</p>
					</div>
				)}

				{data && items.length > 0 && (
					<div className="-mx-2 divide-y divide-border/50">
						{items.map((item) => (
							<FriendActivityItem item={item} key={item._id} type="link" />
						))}
					</div>
				)}
			</div>
		</section>
	);
}
