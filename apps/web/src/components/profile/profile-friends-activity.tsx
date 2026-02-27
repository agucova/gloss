import type { Id } from "@convex/_generated/dataModel";

import { api } from "@convex/_generated/api";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import Loader from "@/components/loader";
import { GeneratedAvatar } from "@/components/profile/profile-header";

interface ProfileFriendsActivityProps {
	userId: Id<"users">;
	userName: string;
	isOwnProfile: boolean;
}

export function ProfileFriendsActivity({
	userId,
	userName,
	isOwnProfile,
}: ProfileFriendsActivityProps) {
	const friends = useQuery(api.users.getUserFriends, { userId });

	const renderFriendsList = () => {
		if (friends === undefined) {
			return (
				<div className="flex justify-center py-8">
					<Loader />
				</div>
			);
		}

		if (friends && friends.length > 0) {
			return (
				<div className="space-y-2">
					{friends.slice(0, 10).map((friend) => (
						<FriendItem friend={friend} key={friend._id} />
					))}

					{friends.length > 10 && (
						<p className="pt-2 text-xs text-muted-foreground">
							+{friends.length - 10} more friends
						</p>
					)}
				</div>
			);
		}

		return (
			<p className="py-4 text-sm text-muted-foreground">
				{isOwnProfile
					? "You haven't added any friends yet"
					: "No friends to show"}
			</p>
		);
	};

	return (
		<div>
			<h2 className="mb-4 text-sm font-medium text-foreground">
				{isOwnProfile ? "Your friends" : `${userName}'s friends`}
			</h2>
			{renderFriendsList()}
		</div>
	);
}

interface FriendItemProps {
	friend: {
		_id: Id<"users">;
		name: string;
		username?: string | null;
		image?: string | null;
	};
}

function FriendItem({ friend }: FriendItemProps) {
	const friendUrl = friend.username ? `/u/${friend.username}` : "#";

	return (
		<Link
			className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
			to={friendUrl}
		>
			{friend.image ? (
				<img
					alt={friend.name}
					className="h-8 w-8 rounded-full object-cover"
					height={32}
					src={friend.image}
					width={32}
				/>
			) : (
				<GeneratedAvatar name={friend.name} size="sm" />
			)}
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium text-foreground">
					{friend.name}
				</p>
				{friend.username && (
					<p className="truncate text-xs text-muted-foreground">
						@{friend.username}
					</p>
				)}
			</div>
		</Link>
	);
}
