import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

export const Route = createFileRoute("/dashboard")({
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
	const { session } = Route.useRouteContext();

	const friendsQuery = useQuery({
		queryKey: ["friends"],
		queryFn: async () => {
			const { data } = await api.api.friendships.index.get();
			return data;
		},
	});

	return (
		<div className="container mx-auto max-w-3xl px-4 py-8">
			<h1 className="mb-4 font-bold text-2xl">Dashboard</h1>
			<p className="mb-4">Welcome, {session.data?.user.name}!</p>
			<section className="rounded-lg border p-4">
				<h2 className="mb-2 font-medium">Friends</h2>
				{friendsQuery.isLoading ? (
					<p className="text-muted-foreground">Loading...</p>
				) : friendsQuery.data && Array.isArray(friendsQuery.data) ? (
					<p className="text-muted-foreground">
						You have {friendsQuery.data.length} friend
						{friendsQuery.data.length !== 1 ? "s" : ""}
					</p>
				) : (
					<p className="text-muted-foreground">No friends yet</p>
				)}
			</section>
		</div>
	);
}
