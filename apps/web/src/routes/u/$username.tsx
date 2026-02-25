import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import Loader from "@/components/loader";
import { ProfileEditModal } from "@/components/profile/profile-edit-modal";
import { ProfileFriendsActivity } from "@/components/profile/profile-friends-activity";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

export const Route = createFileRoute("/u/$username")({
	component: ProfilePage,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			redirect({
				to: "/login",
				throw: true,
			});
		}
		return { session: session.data };
	},
});

function ProfilePage() {
	const { username } = Route.useParams();

	// Fetch profile data
	const {
		data: profile,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["user", "by-username", username],
		queryFn: async () => {
			const { data, error } = await api.api.users["by-username"]({
				username,
			}).get();
			if (error) {
				const errObj = error as { error?: string };
				throw new Error(errObj.error ?? "Failed to fetch profile");
			}
			if (!data || "error" in data) {
				throw new Error("Failed to fetch profile");
			}
			return data;
		},
	});

	if (isLoading) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
				<Loader />
			</div>
		);
	}

	if (error || !profile) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6">
				<h1 className="mb-2 text-lg font-medium text-foreground">
					User not found
				</h1>
				<p className="text-sm text-muted-foreground">
					The user @{username} doesn't exist.
				</p>
			</div>
		);
	}

	const isOwnProfile = profile.isOwnProfile;

	return (
		<div className="mx-auto w-full max-w-7xl px-6 py-8">
			<div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr_280px]">
				{/* Left sidebar - Profile info */}
				<aside className="lg:sticky lg:top-8 lg:h-fit">
					<ProfileHeader isOwnProfile={isOwnProfile} profile={profile} />
				</aside>

				{/* Main content - Tabs with highlights/bookmarks */}
				<main className="min-w-0">
					<ProfileTabs isOwnProfile={isOwnProfile} profile={profile} />
				</main>

				{/* Right sidebar - Friends activity */}
				<aside className="hidden lg:sticky lg:top-8 lg:block lg:h-fit">
					<ProfileFriendsActivity
						isOwnProfile={isOwnProfile}
						userId={profile.id}
						userName={profile.name}
					/>
				</aside>
			</div>

			{/* Edit modal for own profile */}
			{isOwnProfile && <ProfileEditModal profile={profile} />}
		</div>
	);
}
