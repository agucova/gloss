import { api } from "@convex/_generated/api";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type Search = { request?: string };

export const Route = createFileRoute("/cli/authorize")({
	validateSearch: (search: Record<string, unknown>): Search => ({
		request: typeof search.request === "string" ? search.request : undefined,
	}),
	beforeLoad: async ({ search, location }) => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({
				to: "/login",
				search: { returnTo: location.href },
			});
		}
		if (!search.request) {
			throw redirect({ to: "/" });
		}
		return { session: session.data };
	},
	component: CliAuthorizePage,
});

function CliAuthorizePage() {
	const { request } = Route.useSearch();
	// biome-ignore lint/style/noNonNullAssertion: beforeLoad guarantees request is set
	const requestId = request! as any;

	const pending = useQuery(api.cliAuth.getPendingRequest, { requestId });
	const approveRequest = useMutation(api.cliAuth.approveRequest);
	const denyRequest = useMutation(api.cliAuth.denyRequest);
	const [submitting, setSubmitting] = useState<null | "approve" | "deny">(null);
	const [remaining, setRemaining] = useState<number | null>(null);

	useEffect(() => {
		if (pending?.status !== "pending" || !pending.expiresAt) return;
		const tick = () => {
			setRemaining(Math.max(0, pending.expiresAt! - Date.now()));
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [pending]);

	if (pending === undefined) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
				<Loader />
			</div>
		);
	}

	if (pending.status !== "pending") {
		return (
			<Frame>
				<h1 className="text-lg font-medium tracking-tight text-foreground">
					{pending.status === "expired"
						? "This request has expired"
						: pending.status === "approved"
							? "This request was already approved"
							: "Request not found"}
				</h1>
				<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
					Return to your terminal and run <code>gloss auth login</code> again to
					start a fresh request.
				</p>
			</Frame>
		);
	}

	const handleApprove = async () => {
		setSubmitting("approve");
		try {
			const { redirectUrl } = await approveRequest({ requestId });
			window.location.replace(redirectUrl);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Approval failed");
			setSubmitting(null);
		}
	};

	const handleDeny = async () => {
		setSubmitting("deny");
		try {
			const { redirectUrl } = await denyRequest({ requestId });
			window.location.replace(redirectUrl);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Deny failed");
			setSubmitting(null);
		}
	};

	const seconds = remaining === null ? null : Math.floor(remaining / 1000);

	return (
		<Frame>
			<div className="mb-8 flex flex-col items-center">
				<Logo className="mb-4 h-10 w-auto text-foreground" />
				<p className="text-xs tracking-widest text-muted-foreground uppercase">
					CLI authorization
				</p>
			</div>

			<h1 className="text-center text-xl font-medium tracking-tight text-foreground">
				Grant the Gloss CLI read access?
			</h1>
			<p className="mt-3 text-center text-sm leading-relaxed text-muted-foreground">
				An instance of the Gloss CLI on this device is requesting read-only
				access to your highlights, bookmarks, tags, and comments. You can revoke
				this access anytime from your settings.
			</p>

			<ul className="mt-6 space-y-2 rounded-lg border border-border bg-muted/20 p-4 text-sm">
				<Scope label="Read your highlights" />
				<Scope label="Read your bookmarks and tags" />
				<Scope label="Read visible friends' highlights" />
				<Scope label="Cannot create, edit, or delete anything" emphasis />
			</ul>

			{seconds !== null && seconds > 0 && (
				<p className="mt-4 text-center text-xs text-muted-foreground">
					Expires in {Math.floor(seconds / 60)}:
					{String(seconds % 60).padStart(2, "0")}
				</p>
			)}

			<div className="mt-8 flex flex-col gap-3">
				<Button
					className="h-10 w-full rounded-lg text-sm"
					disabled={submitting !== null}
					onClick={handleApprove}
					type="button"
				>
					{submitting === "approve" ? (
						<Loader className="size-4" inline />
					) : (
						"Approve"
					)}
				</Button>
				<Button
					className="h-10 w-full rounded-lg text-sm"
					disabled={submitting !== null}
					onClick={handleDeny}
					type="button"
					variant="ghost"
				>
					{submitting === "deny" ? (
						<Loader className="size-4" inline />
					) : (
						"Deny"
					)}
				</Button>
			</div>
		</Frame>
	);
}

function Frame({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-16">
			<div className="relative w-full max-w-sm">{children}</div>
		</div>
	);
}

function Scope({ label, emphasis }: { label: string; emphasis?: boolean }) {
	return (
		<li className={emphasis ? "text-foreground" : "text-muted-foreground"}>
			<span className="mr-2 text-muted-foreground">•</span>
			{label}
		</li>
	);
}
