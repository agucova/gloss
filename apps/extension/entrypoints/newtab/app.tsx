import type { DashboardApiClient } from "@gloss/dashboard";
import { Dashboard } from "@gloss/dashboard";
import { useEffect, useState } from "react";

import { type ApiClient, createApiClient } from "@/utils/api";

function LoadingState() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<p className="text-muted-foreground text-sm">Loading...</p>
		</div>
	);
}

function UnauthenticatedState() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
			<h1 className="font-medium text-foreground text-xl">Welcome to Gloss</h1>
			<p className="text-muted-foreground text-sm">
				Sign in to see your dashboard
			</p>
			<a
				className="rounded-lg bg-foreground px-4 py-2 text-background text-sm transition-opacity hover:opacity-90"
				href="http://localhost:3001/login"
				rel="noopener noreferrer"
				target="_blank"
			>
				Sign in
			</a>
		</div>
	);
}

export default function App() {
	const [apiClient, setApiClient] = useState<ApiClient | null>(null);
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

	useEffect(() => {
		async function init() {
			const client = await createApiClient();
			setApiClient(client);

			// Check if user is authenticated by trying to fetch their bookmarks
			try {
				const { error } = await client.api.bookmarks.get({
					query: { limit: 1 },
				});
				setIsAuthenticated(!error);
			} catch {
				setIsAuthenticated(false);
			}
		}
		init();
	}, []);

	if (apiClient === null || isAuthenticated === null) {
		return <LoadingState />;
	}

	if (!isAuthenticated) {
		return <UnauthenticatedState />;
	}

	// Cast to dashboard's expected interface
	const dashboardClient = apiClient as unknown as DashboardApiClient;

	return (
		<div className="min-h-screen bg-background">
			<Dashboard apiClient={dashboardClient} />
		</div>
	);
}
