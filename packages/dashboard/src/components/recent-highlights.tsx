/** @jsxImportSource react */
import { useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { FriendActivityItem } from "./friend-activity-item";
import { RecentHighlightsSkeleton } from "./skeleton-loaders";

interface RecentHighlightsProps {
	className?: string;
}

/**
 * Section showing friends' recent highlights.
 */
export function RecentHighlights({ className = "" }: RecentHighlightsProps) {
	const data = useQuery(api.feed.feedHighlights, {
		paginationOpts: { numItems: 5, cursor: null },
	});

	const items = data?.page ?? [];

	return (
		<section className={className}>
			<h2 className="mb-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">
				Recent highlights
			</h2>

			<div className="min-h-32">
				{data === undefined && <RecentHighlightsSkeleton />}

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
