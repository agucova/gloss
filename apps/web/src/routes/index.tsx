import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Authenticated, Unauthenticated } from "convex/react";

// TODO: Replace with Convex-native dashboard
// The dashboard package needs to be rewritten to use Convex hooks directly.
// For now, show a placeholder that confirms auth is working.

export const Route = createFileRoute("/")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<>
			<Authenticated>
				<DashboardPlaceholder />
			</Authenticated>
			<Unauthenticated>
				<Navigate to="/login" />
			</Unauthenticated>
		</>
	);
}

function DashboardPlaceholder() {
	return (
		<div className="mx-auto max-w-4xl px-6 py-12">
			<h1 className="text-lg font-medium text-foreground">Dashboard</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				Dashboard is being migrated to Convex. Coming soon.
			</p>
		</div>
	);
}
