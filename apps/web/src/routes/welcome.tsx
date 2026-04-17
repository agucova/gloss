import { api } from "@convex/_generated/api";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
	pingExtension,
	sendToExtension,
	type StartConnectResult,
} from "@/lib/extension-bridge";
import { markWelcomeDone } from "@/lib/onboarding";

export const Route = createFileRoute("/welcome")({
	component: WelcomePage,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({ to: "/login" });
		}
		return { session: session.data };
	},
});

type ConnectPhase =
	| "idle"
	| "contacting-extension"
	| "waiting-for-login"
	| "finishing";

function WelcomePage() {
	const navigate = useNavigate();
	const profile = useQuery(api.users.getMe);
	const curiusStatus = useQuery(api.curius.getConnectionStatus);

	const [extensionPresent, setExtensionPresent] = useState<boolean | null>(
		null
	);
	const [phase, setPhase] = useState<ConnectPhase>("idle");
	const [error, setError] = useState<string | null>(null);
	const pingedRef = useRef(false);

	useEffect(() => {
		if (pingedRef.current) return;
		pingedRef.current = true;
		void pingExtension(3000).then(setExtensionPresent);
	}, []);

	const connected =
		curiusStatus && "connected" in curiusStatus && curiusStatus.connected;

	// When the backend flips to connected, finish onboarding automatically.
	useEffect(() => {
		if (!connected) return;
		markWelcomeDone();
		const target = profile?.username ? `/u/${profile.username}` : "/profile";
		const id = setTimeout(() => {
			navigate({ to: target });
		}, 1200);
		return () => clearTimeout(id);
	}, [connected, profile?.username, navigate]);

	async function onConnect() {
		if (extensionPresent === false) {
			navigate({ to: "/install" });
			return;
		}
		setError(null);
		setPhase("contacting-extension");
		const result = (await sendToExtension(
			{ type: "START_CONNECT" },
			5000
		)) as StartConnectResult | null;
		if (result === null) {
			setPhase("idle");
			setError("Couldn't reach the Gloss extension. Make sure it's installed.");
			return;
		}
		if ("error" in result) {
			setPhase("idle");
			setError(result.error);
			return;
		}
		setPhase(
			result.mode === "already-connected" ? "finishing" : "waiting-for-login"
		);
	}

	function onSkip() {
		markWelcomeDone();
		const target = profile?.username ? `/u/${profile.username}` : "/profile";
		navigate({ to: target });
	}

	return (
		<div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-16">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute top-1/3 h-72 w-72 rounded-full bg-amber-100/30 blur-3xl dark:bg-amber-500/5"
			/>

			<div className="relative w-full max-w-md">
				<div className="mb-10 text-center">
					<h1 className="text-lg font-medium tracking-tight text-foreground">
						Coming from Curius?
					</h1>
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						Bring your highlights across. We'll connect with your logged-in
						Curius session.
					</p>
				</div>

				<div className="flex flex-col gap-3">
					{phase === "waiting-for-login" && (
						<div className="rounded-lg border border-border bg-card p-4 text-sm">
							<p className="text-foreground">
								We opened curius.app in a new tab. Sign in however you normally
								do (Google, email, whatever) and we'll pick it up automatically.
							</p>
						</div>
					)}

					{phase === "finishing" && (
						<div className="rounded-lg border border-border bg-card p-4 text-sm">
							<p className="text-foreground">
								Found your Curius session. Importing your highlights now…
							</p>
						</div>
					)}

					{connected && (
						<div className="rounded-lg border border-border bg-card p-4 text-sm">
							<p className="font-medium text-foreground">
								Connected to Curius.
							</p>
							<p className="text-muted-foreground">
								Your highlights are importing in the background. Sending you to
								your profile.
							</p>
						</div>
					)}

					{error && (
						<p className="text-sm text-destructive" role="alert">
							{error}
						</p>
					)}

					{extensionPresent === false && (
						<p className="text-xs text-muted-foreground">
							The Gloss extension isn't installed in this browser. You'll need
							it to import from Curius.
						</p>
					)}

					{!connected && (
						<div className="flex flex-col gap-2">
							<Button
								className="h-10 w-full rounded-lg text-sm"
								disabled={
									phase === "contacting-extension" ||
									phase === "waiting-for-login" ||
									phase === "finishing" ||
									extensionPresent === null
								}
								onClick={onConnect}
								type="button"
							>
								{phase === "contacting-extension" ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Contacting extension…
									</>
								) : phase === "waiting-for-login" ? (
									"Waiting for Curius sign-in…"
								) : phase === "finishing" ? (
									"Finishing up…"
								) : extensionPresent === false ? (
									"Install the Gloss extension"
								) : (
									"Connect Curius"
								)}
							</Button>
							<button
								className="w-full cursor-pointer bg-transparent p-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
								onClick={onSkip}
								type="button"
							>
								Skip for now
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
