/** @jsxImportSource react */
import { useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { FriendActivityItem } from "./friend-activity-item";
import { RecentLinksSkeleton } from "./skeleton-loaders";

interface RecentLinksProps {
	className?: string;
}

/**
 * Section showing friends' recent bookmarks/links.
 */
export function RecentLinks({ className = "" }: RecentLinksProps) {
	const data = useQuery(api.feed.feedBookmarks, {
		paginationOpts: { numItems: 8, cursor: null },
	});

	const items = data?.page ?? [];

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
