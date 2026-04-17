/** @jsxImportSource react */
import { useQuery } from "convex/react";
import { useMemo } from "react";

import type { MergedFeedHighlight } from "../types";

import { api } from "../../../../convex/_generated/api";
import { useCuriusFriendFeed } from "../hooks/use-curius-friend-feed";
import { mergeFeeds } from "../utils/merge-feeds";
import { FriendActivityItem } from "./friend-activity-item";
import { RecentHighlightsSkeleton } from "./skeleton-loaders";

const DISPLAY_LIMIT = 5;
/** Fetch a wider bridge batch than we'll display so the post-dedup slice is full. */
const BRIDGE_FETCH_LIMIT = 20;

interface RecentHighlightsProps {
	className?: string;
}

/**
 * Section showing friends' recent highlights. Merges reactive native data
 * (via `api.feed.feedHighlights`) with Curius-bridged activity so that
 * Gloss users whose friends haven't migrated still see their highlights.
 * Native wins on any externalId collision — the imported-from-Curius native
 * copy is higher-fidelity than the bridged one.
 */
export function RecentHighlights({ className = "" }: RecentHighlightsProps) {
	const data = useQuery(api.feed.feedHighlights, {
		paginationOpts: { numItems: DISPLAY_LIMIT, cursor: null },
	});
	const bridge = useCuriusFriendFeed("highlights", BRIDGE_FETCH_LIMIT);

	const items = useMemo<MergedFeedHighlight[]>(() => {
		return mergeFeeds<MergedFeedHighlight>(
			data?.page as MergedFeedHighlight[] | undefined,
			bridge.items as MergedFeedHighlight[],
			DISPLAY_LIMIT
		);
	}, [data?.page, bridge.items]);

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
