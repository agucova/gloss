import type { DashboardApiClient } from "@gloss/dashboard";

import { Dashboard } from "@gloss/dashboard";
import { useEffect, useMemo, useState } from "react";

import { Logo } from "../../components/logo";
import { isErrorResponse, sendMessage } from "../../utils/messages";
import { initTheme } from "../../utils/theme";

const WEB_APP_URL = import.meta.env.VITE_WEB_URL || "http://localhost:3001";

// Initialize theme as early as possible
initTheme();

function Header() {
	return (
		<header className="bg-background">
			<div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
				<a
					className="text-foreground"
					href={WEB_APP_URL}
					rel="noopener noreferrer"
					target="_blank"
				>
					<Logo className="h-6 w-auto" />
				</a>
				<a
					className="text-sm text-muted-foreground transition-colors hover:text-foreground"
					href={WEB_APP_URL}
					rel="noopener noreferrer"
					target="_blank"
				>
					Open Gloss ↗
				</a>
			</div>
		</header>
	);
}

function LoadingState() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<p className="text-sm text-muted-foreground">Loading...</p>
		</div>
	);
}

function UnauthenticatedState() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
			<Logo className="h-10 w-auto text-foreground" />
			<p className="text-sm text-muted-foreground">
				Sign in to see your dashboard
			</p>
			<a
				className="rounded-lg bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90"
				href={`${WEB_APP_URL}/login`}
				rel="noopener noreferrer"
				target="_blank"
			>
				Sign in
			</a>
		</div>
	);
}

/**
 * Create a dashboard API client that routes through the background script.
 * This is necessary because extension pages can't send cookies directly.
 */
function createDashboardClient(): DashboardApiClient {
	return {
		api: {
			feed: {
				get: async (options) => {
					const response = await sendMessage({
						type: "GET_FEED_HIGHLIGHTS",
						cursor: options?.query?.cursor,
						limit: options?.query?.limit,
					});
					if (isErrorResponse(response)) {
						return { error: response.error };
					}
					return { data: response };
				},
				bookmarks: {
					get: async (options) => {
						const response = await sendMessage({
							type: "GET_FEED_BOOKMARKS",
							cursor: options?.query?.cursor,
							limit: options?.query?.limit,
						});
						if (isErrorResponse(response)) {
							return { error: response.error };
						}
						return { data: response };
					},
				},
			},
			bookmarks: {
				get: async (options) => {
					const response = await sendMessage({
						type: "GET_MY_BOOKMARKS",
						cursor: options?.query?.cursor,
						limit: options?.query?.limit,
					});
					if (isErrorResponse(response)) {
						return { error: response.error };
					}
					return { data: response };
				},
			},
			search: {
				get: async (options) => {
					const response = await sendMessage({
						type: "SEARCH_DASHBOARD",
						query: options.query.q,
						limit: options.query.limit,
					});
					if (isErrorResponse(response)) {
						return { error: response.error };
					}
					return { data: response };
				},
			},
		},
	};
}

export default function App() {
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

	const dashboardClient = useMemo(() => createDashboardClient(), []);

	useEffect(() => {
		async function checkAuth() {
			const response = await sendMessage({ type: "GET_AUTH_STATUS" });
			setIsAuthenticated(response.authenticated);
		}
		checkAuth();
	}, []);

	if (isAuthenticated === null) {
		return <LoadingState />;
	}

	if (!isAuthenticated) {
		return <UnauthenticatedState />;
	}

	return (
		<div className="min-h-screen bg-background">
			<Header />
			<Dashboard apiClient={dashboardClient} />
		</div>
	);
}
