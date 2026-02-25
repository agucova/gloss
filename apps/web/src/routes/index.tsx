import type { DashboardApiClient } from "@gloss/dashboard";

import { Dashboard } from "@gloss/dashboard";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

export const Route = createFileRoute("/")({
	component: RouteComponent,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			redirect({
				to: "/login",
				throw: true,
			});
		}
		return { session };
	},
});

function RouteComponent() {
	// Cast the Eden Treaty client to match dashboard's expected interface
	const apiClient = api as unknown as DashboardApiClient;

	return <Dashboard apiClient={apiClient} />;
}
