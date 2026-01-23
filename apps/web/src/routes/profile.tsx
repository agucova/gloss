import { createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/profile")({
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
	const { session } = Route.useRouteContext();

	return (
		<div className="mx-auto w-full max-w-4xl px-6 py-10">
			<h1 className="mb-8 font-semibold text-2xl text-foreground">Profile</h1>

			<div className="rounded-xl border border-border bg-card p-6">
				<div className="space-y-4">
					<div>
						<p className="text-muted-foreground text-sm">Name</p>
						<p className="font-medium text-foreground">{session?.user.name}</p>
					</div>
					<div>
						<p className="text-muted-foreground text-sm">Email</p>
						<p className="font-medium text-foreground">{session?.user.email}</p>
					</div>
				</div>
			</div>
		</div>
	);
}
