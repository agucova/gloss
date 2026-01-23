import { createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

export const Route = createFileRoute("/profile")({
	component: () => null,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({
				to: "/login",
			});
		}

		// Fetch user profile to check for username
		const { data: profile, error } = await api.api.users.me.get();

		if (error || !profile || "error" in profile) {
			throw redirect({
				to: "/login",
			});
		}

		// Redirect based on whether user has a username
		if (profile.username) {
			throw redirect({
				to: "/u/$username",
				params: { username: profile.username },
			});
		}
		throw redirect({
			to: "/u/setup",
		});
	},
});
