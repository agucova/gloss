import { useFriendsBookmarks } from "../hooks/use-friends-bookmarks";
import type { DashboardApiClient } from "../types";
import { FriendActivityItem } from "./friend-activity-item";
import { RecentLinksSkeleton } from "./skeleton-loaders";

interface RecentLinksProps {
	apiClient: DashboardApiClient;
	className?: string;
}

/**
 * Section showing friends' recent bookmarks/links.
 */
export function RecentLinks({ apiClient, className = "" }: RecentLinksProps) {
	const { data, isLoading, error } = useFriendsBookmarks({
		apiClient,
		limit: 8,
	});

	return (
		<section className={className}>
			<h2 className="mb-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
				Recent bookmarks
			</h2>

			<div className="min-h-32 rounded-xl border border-border bg-card px-4 py-1.5">
				{isLoading && <RecentLinksSkeleton />}

				{error && (
					<div className="flex h-24 items-center justify-center">
						<p className="text-muted-foreground text-sm">
							Unable to load recent bookmarks
						</p>
					</div>
				)}

				{data && data.items.length === 0 && (
					<div className="flex h-24 items-center justify-center">
						<p className="text-muted-foreground text-sm">
							No recent bookmarks from friends yet
						</p>
					</div>
				)}

				{data && data.items.length > 0 && (
					<div className="-mx-2 divide-y divide-border/50">
						{data.items.map((item) => (
							<FriendActivityItem item={item} key={item.id} type="link" />
						))}
					</div>
				)}
			</div>
		</section>
	);
}
