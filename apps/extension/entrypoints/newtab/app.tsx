/** @jsxImportSource react */
import { Dashboard } from "@gloss/dashboard";
import { useEffect, useState } from "react";

import { Logo } from "../../components/logo";
import { sendMessage } from "../../utils/messages";
import { initTheme } from "../../utils/theme";

const WEB_APP_URL = import.meta.env.VITE_WEB_URL || "http://localhost:3001";

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

type AuthState = "loading" | "authenticated" | "unauthenticated";

export default function App() {
	const [authState, setAuthState] = useState<AuthState>("loading");

	useEffect(() => {
		let cancelled = false;
		async function check() {
			try {
				const response = await sendMessage({ type: "GET_AUTH_STATUS" });
				if (cancelled) return;
				setAuthState(
					response.authenticated ? "authenticated" : "unauthenticated"
				);
			} catch {
				if (!cancelled) setAuthState("unauthenticated");
			}
		}
		check();
		return () => {
			cancelled = true;
		};
	}, []);

	if (authState === "loading") return <LoadingState />;
	if (authState === "unauthenticated") return <UnauthenticatedState />;
	return (
		<div className="min-h-screen bg-background">
			<Header />
			<Dashboard />
		</div>
	);
}
