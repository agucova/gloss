import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, Unauthenticated } from "convex/react";

import { Landing } from "@/components/landing/landing";

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
				<Landing />
			</Unauthenticated>
		</>
	);
}

// Dashboard is being migrated to Convex. Landing above handles unauth'd visitors.
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
