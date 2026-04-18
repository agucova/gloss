import type { Id } from "@convex/_generated/dataModel";

import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { Globe } from "lucide-react";
import Markdown from "react-markdown";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const WWW_REGEX = /^www\./;
const WHITESPACE_RE = /\s+/;

function Github({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="currentColor"
			role="img"
			viewBox="0 0 24 24"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>GitHub</title>
			<path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.42-4.04-1.42-.55-1.4-1.34-1.77-1.34-1.77-1.1-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.08 1.85 2.83 1.32 3.52 1 .11-.78.42-1.32.76-1.62-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.1-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
		</svg>
	);
}

function Twitter({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="currentColor"
			role="img"
			viewBox="0 0 24 24"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>X</title>
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
		</svg>
	);
}

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
		// biome-ignore lint/suspicious/noBitwiseOperators: intentional hash computation
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	// Modular arithmetic guarantees a valid index into the non-empty array
	return AVATAR_COLORS[
		Math.abs(hash) % AVATAR_COLORS.length
	] as (typeof AVATAR_COLORS)[number];
}

function getInitials(name: string) {
	const parts = name.trim().split(WHITESPACE_RE);
	const first = parts[0];
	if (parts.length >= 2 && first) {
		const last = parts.at(-1) ?? first;
		return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
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
		_id: Id<"users">;
		name: string;
		username?: string | null;
		image?: string | null;
		bio?: string | null;
		website?: string | null;
		twitterHandle?: string | null;
		githubHandle?: string | null;
		highlightCount: number;
		bookmarkCount: number;
		friendCount: number;
		isOwnProfile: boolean;
		isFriend: boolean;
	};
	isOwnProfile: boolean;
}

export function ProfileHeader({ profile, isOwnProfile }: ProfileHeaderProps) {
	const sendFriendRequestMutation = useMutation(api.friendships.sendRequest);
	const unfriendMutation = useMutation(api.friendships.removeFriend);

	const sendFriendRequest = {
		isPending: false,
		mutate: async () => {
			try {
				await sendFriendRequestMutation({ addresseeId: profile._id });
				toast.success("Friend request sent");
			} catch (err) {
				toast.error(
					err instanceof Error ? err.message : "Failed to send request"
				);
			}
		},
	};

	const unfriend = {
		isPending: false,
		mutate: async () => {
			try {
				await unfriendMutation({ targetUserId: profile._id });
				toast.success("Friend removed");
			} catch (err) {
				toast.error(
					err instanceof Error ? err.message : "Failed to remove friend"
				);
			}
		},
	};

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

				<h1 className="mt-4 text-xl font-semibold text-foreground">
					{profile.name}
				</h1>

				{profile.username && (
					<p className="text-sm text-muted-foreground">@{profile.username}</p>
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
						isFriend={profile.isFriend}
						isLoading={sendFriendRequest.isPending || unfriend.isPending}
						onAddFriend={() => sendFriendRequest.mutate()}
						onUnfriend={() => unfriend.mutate()}
					/>
				)}
			</div>

			{/* Bio */}
			{profile.bio && (
				<div className="max-w-none text-sm leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_p]:m-0 [&_p+p]:mt-2 [&_strong]:text-foreground">
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
			<div className="flex justify-center gap-6 border-t border-border pt-4 text-center lg:justify-start">
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
			className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
			<p className="text-xs text-muted-foreground">{label}</p>
		</div>
	);
}

interface FriendshipButtonProps {
	isFriend: boolean;
	isLoading: boolean;
	onAddFriend: () => void;
	onUnfriend: () => void;
}

function FriendshipButton({
	isFriend,
	isLoading,
	onAddFriend,
	onUnfriend,
}: FriendshipButtonProps) {
	if (isFriend) {
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
	}
	return (
		<Button className="w-full" disabled={isLoading} onClick={onAddFriend}>
			{isLoading ? "Sending..." : "Add Friend"}
		</Button>
	);
}
