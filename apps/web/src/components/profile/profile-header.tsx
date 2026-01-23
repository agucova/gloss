import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Github, Globe, Twitter } from "lucide-react";
import Markdown from "react-markdown";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";

const WWW_REGEX = /^www\./;

const AVATAR_COLORS = [
	{
		bg: "bg-amber-100 dark:bg-amber-900/40",
		text: "text-amber-700 dark:text-amber-300",
	},
	{
		bg: "bg-rose-100 dark:bg-rose-900/40",
		text: "text-rose-700 dark:text-rose-300",
	},
	{
		bg: "bg-sky-100 dark:bg-sky-900/40",
		text: "text-sky-700 dark:text-sky-300",
	},
	{
		bg: "bg-emerald-100 dark:bg-emerald-900/40",
		text: "text-emerald-700 dark:text-emerald-300",
	},
	{
		bg: "bg-violet-100 dark:bg-violet-900/40",
		text: "text-violet-700 dark:text-violet-300",
	},
	{
		bg: "bg-orange-100 dark:bg-orange-900/40",
		text: "text-orange-700 dark:text-orange-300",
	},
	{
		bg: "bg-teal-100 dark:bg-teal-900/40",
		text: "text-teal-700 dark:text-teal-300",
	},
	{
		bg: "bg-pink-100 dark:bg-pink-900/40",
		text: "text-pink-700 dark:text-pink-300",
	},
];

function getAvatarColor(name: string) {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
	const parts = name.trim().split(/\s+/);
	if (parts.length >= 2) {
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
}

interface GeneratedAvatarProps {
	name: string;
	size?: "sm" | "md" | "lg";
	className?: string;
}

export function GeneratedAvatar({
	name,
	size = "md",
	className = "",
}: GeneratedAvatarProps) {
	const colors = getAvatarColor(name);
	const initials = getInitials(name);

	const sizeClasses = {
		sm: "h-8 w-8 text-xs",
		md: "h-10 w-10 text-sm",
		lg: "mx-auto h-20 w-20 text-3xl font-semibold lg:mx-0",
	};

	return (
		<div
			className={`flex items-center justify-center rounded-full font-medium ${colors.bg} ${colors.text} ${sizeClasses[size]} ${className}`}
		>
			{initials}
		</div>
	);
}

interface ProfileHeaderProps {
	profile: {
		id: string;
		name: string;
		username: string | null;
		image: string | null;
		bio: string | null;
		website: string | null;
		twitterHandle: string | null;
		githubHandle: string | null;
		highlightCount: number;
		bookmarkCount: number;
		friendCount: number;
		friendshipStatus?: "none" | "pending_sent" | "pending_received" | "friends";
	};
	isOwnProfile: boolean;
}

export function ProfileHeader({ profile, isOwnProfile }: ProfileHeaderProps) {
	const queryClient = useQueryClient();

	// Friend request mutation
	const sendFriendRequest = useMutation({
		mutationFn: async () => {
			const { error } = await api.api.friendships.request.post({
				userId: profile.id,
			});
			if (error) {
				const errObj = error as { error?: string };
				throw new Error(errObj.error ?? "Failed to send request");
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["user", "by-username", profile.username],
			});
			toast.success("Friend request sent");
		},
		onError: (err) => toast.error(err.message),
	});

	// Unfriend mutation - use fetch directly to avoid Eden Treaty type issues
	const unfriend = useMutation({
		mutationFn: async () => {
			const response = await fetch(
				`${import.meta.env.VITE_SERVER_URL}/api/friendships/${profile.id}`,
				{
					method: "DELETE",
					credentials: "include",
				}
			);
			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.error ?? "Failed to remove friend");
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["user", "by-username", profile.username],
			});
			toast.success("Friend removed");
		},
		onError: (err) => toast.error(err.message),
	});

	// Emit event to open edit modal
	const openEditModal = () => {
		window.dispatchEvent(new CustomEvent("open-profile-edit-modal"));
	};

	return (
		<div className="space-y-6">
			{/* Avatar and name */}
			<div className="text-center lg:text-left">
				{profile.image ? (
					<img
						alt={profile.name}
						className="mx-auto h-20 w-20 rounded-full object-cover lg:mx-0"
						height={80}
						src={profile.image}
						width={80}
					/>
				) : (
					<GeneratedAvatar name={profile.name} size="lg" />
				)}

				<h1 className="mt-4 font-semibold text-foreground text-xl">
					{profile.name}
				</h1>

				{profile.username && (
					<p className="text-muted-foreground text-sm">@{profile.username}</p>
				)}
			</div>

			{/* Action button */}
			<div>
				{isOwnProfile ? (
					<Button className="w-full" onClick={openEditModal} variant="outline">
						Edit Profile
					</Button>
				) : (
					<FriendshipButton
						friendshipStatus={profile.friendshipStatus}
						isLoading={sendFriendRequest.isPending || unfriend.isPending}
						onAddFriend={() => sendFriendRequest.mutate()}
						onUnfriend={() => unfriend.mutate()}
					/>
				)}
			</div>

			{/* Bio */}
			{profile.bio && (
				<div className="max-w-none text-muted-foreground text-sm leading-relaxed [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_p+p]:mt-2 [&_p]:m-0 [&_strong]:text-foreground">
					<Markdown
						allowedElements={["p", "strong", "em", "a", "br"]}
						components={{
							a: ({ href, children }) => (
								<a href={href} rel="noopener noreferrer" target="_blank">
									{children}
								</a>
							),
						}}
					>
						{profile.bio}
					</Markdown>
				</div>
			)}

			{/* Social links */}
			<div className="space-y-2">
				{profile.website && (
					<SocialLink
						href={profile.website}
						icon={<Globe className="h-4 w-4" />}
						label={new URL(profile.website).hostname.replace(WWW_REGEX, "")}
					/>
				)}
				{profile.twitterHandle && (
					<SocialLink
						href={`https://x.com/${profile.twitterHandle}`}
						icon={<Twitter className="h-4 w-4" />}
						label={`@${profile.twitterHandle}`}
					/>
				)}
				{profile.githubHandle && (
					<SocialLink
						href={`https://github.com/${profile.githubHandle}`}
						icon={<Github className="h-4 w-4" />}
						label={profile.githubHandle}
					/>
				)}
			</div>

			{/* Stats */}
			<div className="flex justify-center gap-6 border-border border-t pt-4 text-center lg:justify-start">
				<Stat label="highlights" value={profile.highlightCount} />
				<Stat label="bookmarks" value={profile.bookmarkCount} />
				<Stat label="friends" value={profile.friendCount} />
			</div>
		</div>
	);
}

interface SocialLinkProps {
	href: string;
	icon: React.ReactNode;
	label: string;
}

function SocialLink({ href, icon, label }: SocialLinkProps) {
	return (
		<a
			className="flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
			href={href}
			rel="noopener noreferrer"
			target="_blank"
		>
			{icon}
			<span>{label}</span>
		</a>
	);
}

interface StatProps {
	value: number;
	label: string;
}

function Stat({ value, label }: StatProps) {
	return (
		<div>
			<p className="font-semibold text-foreground">{value}</p>
			<p className="text-muted-foreground text-xs">{label}</p>
		</div>
	);
}

interface FriendshipButtonProps {
	friendshipStatus?: "none" | "pending_sent" | "pending_received" | "friends";
	isLoading: boolean;
	onAddFriend: () => void;
	onUnfriend: () => void;
}

function FriendshipButton({
	friendshipStatus,
	isLoading,
	onAddFriend,
	onUnfriend,
}: FriendshipButtonProps) {
	switch (friendshipStatus) {
		case "friends":
			return (
				<Button
					className="w-full"
					disabled={isLoading}
					onClick={onUnfriend}
					variant="outline"
				>
					{isLoading ? "Removing..." : "Friends"}
				</Button>
			);
		case "pending_sent":
			return (
				<Button className="w-full" disabled variant="outline">
					Pending
				</Button>
			);
		case "pending_received":
			return (
				<Button className="w-full" disabled={isLoading} onClick={onAddFriend}>
					{isLoading ? "Accepting..." : "Accept Request"}
				</Button>
			);
		default:
			return (
				<Button className="w-full" disabled={isLoading} onClick={onAddFriend}>
					{isLoading ? "Sending..." : "Add Friend"}
				</Button>
			);
	}
}
