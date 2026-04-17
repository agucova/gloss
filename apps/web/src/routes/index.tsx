import { Dashboard } from "@gloss/dashboard";
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
				<Dashboard />
			</Authenticated>
			<Unauthenticated>
				<Landing />
			</Unauthenticated>
		</>
	);
}
