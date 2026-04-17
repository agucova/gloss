/** @jsxImportSource react */
import type { FeedHighlightsPage } from "../types";

import { useFriendsHighlights } from "../hooks/use-friends-highlights";
import { FriendActivityItem } from "./friend-activity-item";
import { RecentHighlightsSkeleton } from "./skeleton-loaders";

interface RecentHighlightsProps {
	fetcher: (limit: number) => Promise<FeedHighlightsPage>;
	className?: string;
}

/**
 * Section showing friends' recent highlights.
 */
export function RecentHighlights({
	fetcher,
	className = "",
}: RecentHighlightsProps) {
	const { data, isLoading, error } = useFriendsHighlights({
		fetcher,
		limit: 5,
	});

	const items = data?.page ?? [];

	return (
		<section className={className}>
			<h2 className="mb-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">
				Recent highlights
			</h2>

			<div className="min-h-32">
				{isLoading && <RecentHighlightsSkeleton />}

				{error && (
					<div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border">
						<p className="text-sm text-muted-foreground">
							Unable to load recent highlights
						</p>
					</div>
				)}

				{data && items.length === 0 && (
					<div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border">
						<p className="text-sm text-muted-foreground">
							No recent highlights from friends yet
						</p>
					</div>
				)}

				{data && items.length > 0 && (
					<div className="space-y-3">
						{items.map((item) => (
							<FriendActivityItem item={item} key={item._id} type="highlight" />
						))}
					</div>
				)}
			</div>
		</section>
	);
}
