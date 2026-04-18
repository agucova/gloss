import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, Unauthenticated } from "convex/react";
import { lazy, Suspense } from "react";

import { Landing } from "@/components/landing/landing";

const Dashboard = lazy(() =>
	import("@gloss/dashboard").then((m) => ({ default: m.Dashboard }))
);

export const Route = createFileRoute("/")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<>
			<Authenticated>
				<Suspense fallback={null}>
					<Dashboard />
				</Suspense>
			</Authenticated>
			<Unauthenticated>
				<Landing />
			</Unauthenticated>
		</>
	);
}
