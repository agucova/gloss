import { api } from "@convex/_generated/api";
import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/profile")({
	component: ProfileRedirect,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({ to: "/login" });
		}
	},
});

function ProfileRedirect() {
	const me = useQuery(api.users.getMe);

	if (me === undefined) return null; // Loading

	if (!me) return <Navigate to="/login" />;

	if (me.username) {
		return <Navigate to={`/u/${me.username}`} />;
	}

	return <Navigate to="/u/setup" />;
}
