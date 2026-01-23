import { useFriendsHighlights } from "../hooks/use-friends-highlights";
import type { DashboardApiClient } from "../types";
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
		limit: 6,
	});

	return (
		<section className={className}>
			<h2 className="mb-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
				Recent highlights
			</h2>

			{isLoading && <RecentHighlightsSkeleton />}

			{error && (
				<div className="flex h-24 items-center justify-center rounded-xl border border-border border-dashed">
					<p className="text-muted-foreground text-sm">
						Unable to load recent highlights
					</p>
				</div>
			)}

			{data && data.items.length === 0 && (
				<div className="flex h-24 items-center justify-center rounded-xl border border-border border-dashed">
					<p className="text-muted-foreground text-sm">
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
		</section>
	);
}
