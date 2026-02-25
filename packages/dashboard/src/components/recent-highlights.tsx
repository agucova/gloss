import type { DashboardApiClient } from "../types";

import { useFriendsHighlights } from "../hooks/use-friends-highlights";
import { FriendActivityItem } from "./friend-activity-item";
import { RecentHighlightsSkeleton } from "./skeleton-loaders";

interface RecentHighlightsProps {
	apiClient: DashboardApiClient;
	className?: string;
}

/**
 * Section showing friends' recent highlights.
 */
export function RecentHighlights({
	apiClient,
	className = "",
}: RecentHighlightsProps) {
	const { data, isLoading, error } = useFriendsHighlights({
		apiClient,
		limit: 5,
	});

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

				{data && data.items.length === 0 && (
					<div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border">
						<p className="text-sm text-muted-foreground">
							No recent highlights from friends yet
						</p>
					</div>
				)}

				{data && data.items.length > 0 && (
					<div className="space-y-3">
						{data.items.map((item) => (
							<FriendActivityItem item={item} key={item.id} type="highlight" />
						))}
					</div>
				)}
			</div>
		</section>
	);
}
