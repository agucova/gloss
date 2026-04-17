/** @jsxImportSource react */
import { useQuery } from "convex/react";
import { useMemo } from "react";

import type { MergedFeedBookmark } from "../types";

import { api } from "../../../../convex/_generated/api";
import { useCuriusFriendFeed } from "../hooks/use-curius-friend-feed";
import { mergeFeeds } from "../utils/merge-feeds";
import { FriendActivityItem } from "./friend-activity-item";
import { RecentLinksSkeleton } from "./skeleton-loaders";

const DISPLAY_LIMIT = 8;
const BRIDGE_FETCH_LIMIT = 20;

interface RecentLinksProps {
	className?: string;
}

/**
 * Section showing friends' recent bookmarks/links. Native Gloss bookmarks
 * merge with Curius-bridged "newlink" activity from friends who haven't
 * migrated. Native wins on dedup by externalId.
 */
export function RecentLinks({ className = "" }: RecentLinksProps) {
	const data = useQuery(api.feed.feedBookmarks, {
		paginationOpts: { numItems: DISPLAY_LIMIT, cursor: null },
	});
	const bridge = useCuriusFriendFeed("bookmarks", BRIDGE_FETCH_LIMIT);

	const items = useMemo<MergedFeedBookmark[]>(() => {
		return mergeFeeds<MergedFeedBookmark>(
			data?.page as MergedFeedBookmark[] | undefined,
			bridge.items as MergedFeedBookmark[],
			DISPLAY_LIMIT
		);
	}, [data?.page, bridge.items]);

	return (
		<section className={className}>
			<h2 className="mb-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">
				Recent bookmarks
			</h2>

			<div className="min-h-32 rounded-xl border border-border bg-card px-4 py-1.5">
				{data === undefined && <RecentLinksSkeleton />}

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
