import { api } from "@convex/_generated/api";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import Loader from "@/components/loader";
import { ProfileEditModal } from "@/components/profile/profile-edit-modal";
import { ProfileFriendsActivity } from "@/components/profile/profile-friends-activity";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { authClient } from "@/lib/auth-client";

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
	const profile = useQuery(api.users.getByUsername, { username });

	if (profile === undefined) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
				<Loader />
			</div>
		);
	}

	if (!profile) {
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
				<aside className="lg:sticky lg:top-8 lg:h-fit">
					<ProfileHeader isOwnProfile={isOwnProfile} profile={profile} />
				</aside>

				<main className="min-w-0">
					<ProfileTabs isOwnProfile={isOwnProfile} profile={profile} />
				</main>

				<aside className="hidden lg:sticky lg:top-8 lg:block lg:h-fit">
					<ProfileFriendsActivity
						isOwnProfile={isOwnProfile}
						userId={profile._id}
						userName={profile.name}
					/>
				</aside>
			</div>

			{isOwnProfile && <ProfileEditModal profile={profile} />}
		</div>
	);
}
