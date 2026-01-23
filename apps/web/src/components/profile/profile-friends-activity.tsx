import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import Loader from "@/components/loader";
import { GeneratedAvatar } from "@/components/profile/profile-header";
import { api } from "@/utils/api";

interface ProfileFriendsActivityProps {
	userId: string;
	userName: string;
	isOwnProfile: boolean;
}

export function ProfileFriendsActivity({
	userId,
	userName,
	isOwnProfile,
}: ProfileFriendsActivityProps) {
	// Fetch user's friends
	const { data: friends, isLoading } = useQuery({
		queryKey: ["user", userId, "friends"],
		queryFn: async () => {
			const { data, error } = await api.api.users({ userId }).friends.get();
			if (error) {
				throw new Error("Failed to fetch friends");
			}
			if (!data || "error" in data) {
				throw new Error("Failed to fetch friends");
			}
			return data;
		},
	});

	const renderFriendsList = () => {
		if (isLoading) {
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
						<FriendItem friend={friend} key={friend.id} />
					))}

					{friends.length > 10 && (
						<p className="pt-2 text-muted-foreground text-xs">
							+{friends.length - 10} more friends
						</p>
					)}
				</div>
			);
		}

		return (
			<p className="py-4 text-muted-foreground text-sm">
				{isOwnProfile
					? "You haven't added any friends yet"
					: "No friends to show"}
			</p>
		);
	};

	return (
		<div>
			<h2 className="mb-4 font-medium text-foreground text-sm">
				{isOwnProfile ? "Your friends" : `${userName}'s friends`}
			</h2>
			{renderFriendsList()}
		</div>
	);
}

interface FriendItemProps {
	friend: {
		id: string;
		name: string;
		username: string | null;
		image: string | null;
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
				<p className="truncate font-medium text-foreground text-sm">
					{friend.name}
				</p>
				{friend.username && (
					<p className="truncate text-muted-foreground text-xs">
						@{friend.username}
					</p>
				)}
			</div>
		</Link>
	);
}
