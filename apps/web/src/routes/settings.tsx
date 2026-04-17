import { api } from "@convex/_generated/api";
import { useForm } from "@tanstack/react-form";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { curiusHealth, formatExpiryCountdown } from "@/lib/curius-health";
import {
	pingExtension,
	sendToExtension,
	type StartConnectResult,
} from "@/lib/extension-bridge";

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({ to: "/login" });
		}
		return { session: session.data };
	},
});

type Visibility = "public" | "friends" | "private";
type HighlightDisplayFilter = "anyone" | "friends" | "me";
type CommentDisplayMode = "expanded" | "collapsed";

function SettingsPage() {
	const settings = useQuery(api.users.getSettings);
	const updateSettingsMutation = useMutation(api.users.updateSettings);

	const form = useForm({
		defaultValues: {
			profileVisibility: (settings?.profileVisibility ??
				"public") as Visibility,
			highlightsVisibility: (settings?.highlightsVisibility ??
				"friends") as Visibility,
			bookmarksVisibility: (settings?.bookmarksVisibility ??
				"public") as Visibility,
			highlightDisplayFilter: (settings?.highlightDisplayFilter ??
				"friends") as HighlightDisplayFilter,
			commentDisplayMode: (settings?.commentDisplayMode ??
				"collapsed") as CommentDisplayMode,
		},
		onSubmit: async ({ value }) => {
			try {
				await updateSettingsMutation(value);
				toast.success("Settings saved");
			} catch (err) {
				toast.error(
					err instanceof Error ? err.message : "Failed to update settings"
				);
			}
		},
	});

	// Update form when settings load
	if (settings && !form.state.isDirty) {
		form.reset({
			profileVisibility: settings.profileVisibility as Visibility,
			highlightsVisibility: settings.highlightsVisibility as Visibility,
			bookmarksVisibility: settings.bookmarksVisibility as Visibility,
			highlightDisplayFilter:
				settings.highlightDisplayFilter as HighlightDisplayFilter,
			commentDisplayMode: settings.commentDisplayMode as CommentDisplayMode,
		});
	}

	if (settings === undefined) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (settings === null) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6">
				<h1 className="mb-2 text-lg font-medium text-foreground">
					Failed to load settings
				</h1>
				<p className="mb-4 text-sm text-muted-foreground">
					Something went wrong. Please try again.
				</p>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
			<div className="mb-8">
				<Link
					className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
					to="/profile"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to profile
				</Link>
				<h1 className="text-2xl font-semibold text-foreground">Settings</h1>
			</div>

			<CuriusSection />

			<form
				className="space-y-10"
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				<section>
					<h2 className="mb-6 text-lg font-semibold text-foreground">
						Privacy
					</h2>

					<div className="space-y-6">
						<form.Field name="profileVisibility">
							{(field) => (
								<SettingRow
									description="Who can view your profile page"
									id={field.name}
									title="Profile"
								>
									<VisibilitySelect
										id={field.name}
										onChange={field.handleChange}
										value={field.state.value}
									/>
								</SettingRow>
							)}
						</form.Field>

						<form.Field name="highlightsVisibility">
							{(field) => (
								<SettingRow
									description="Who can see your highlights on pages"
									id={field.name}
									title="Highlights"
								>
									<VisibilitySelect
										id={field.name}
										onChange={field.handleChange}
										value={field.state.value}
									/>
								</SettingRow>
							)}
						</form.Field>

						<form.Field name="bookmarksVisibility">
							{(field) => (
								<SettingRow
									description="Who can see your saved bookmarks"
									id={field.name}
									title="Bookmarks"
								>
									<VisibilitySelect
										id={field.name}
										onChange={field.handleChange}
										value={field.state.value}
									/>
								</SettingRow>
							)}
						</form.Field>
					</div>
				</section>

				<section>
					<h2 className="mb-6 text-lg font-semibold text-foreground">
						Display
					</h2>

					<div className="space-y-6">
						<form.Field name="highlightDisplayFilter">
							{(field) => (
								<SettingRow
									description="Whose highlights appear on pages"
									id={field.name}
									title="Show highlights from"
								>
									<select
										className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
										id={field.name}
										onChange={(e) =>
											field.handleChange(
												e.target.value as HighlightDisplayFilter
											)
										}
										value={field.state.value}
									>
										<option value="anyone">Everyone</option>
										<option value="friends">Friends only</option>
										<option value="me">Only my own</option>
									</select>
								</SettingRow>
							)}
						</form.Field>

						<form.Field name="commentDisplayMode">
							{(field) => (
								<SettingRow
									description="How comment threads appear by default"
									id={field.name}
									title="Comments"
								>
									<select
										className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
										id={field.name}
										onChange={(e) =>
											field.handleChange(e.target.value as CommentDisplayMode)
										}
										value={field.state.value}
									>
										<option value="collapsed">Collapsed</option>
										<option value="expanded">Expanded</option>
									</select>
								</SettingRow>
							)}
						</form.Field>
					</div>
				</section>

				<div className="border-t border-border pt-6">
					<form.Subscribe>
						{(state) => (
							<div className="flex items-center justify-between">
								<p className="text-sm text-muted-foreground">
									{state.isDirty
										? "You have unsaved changes"
										: "All changes saved"}
								</p>
								<Button
									disabled={!state.isDirty || state.isSubmitting}
									type="submit"
								>
									{state.isSubmitting ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Saving
										</>
									) : (
										"Save changes"
									)}
								</Button>
							</div>
						)}
					</form.Subscribe>
				</div>
			</form>
		</div>
	);
}

interface SettingRowProps {
	id: string;
	title: string;
	description: string;
	children: React.ReactNode;
}

function SettingRow({ id, title, description, children }: SettingRowProps) {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
			<label className="flex-1 cursor-pointer" htmlFor={id}>
				<p className="text-sm text-foreground">{title}</p>
				<p className="text-xs text-muted-foreground">{description}</p>
			</label>
			<div className="w-full sm:w-48 sm:shrink-0">{children}</div>
		</div>
	);
}

interface VisibilitySelectProps {
	id: string;
	value: Visibility;
	onChange: (value: Visibility) => void;
}

function VisibilitySelect({ id, value, onChange }: VisibilitySelectProps) {
	return (
		<select
			className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
			id={id}
			onChange={(e) => onChange(e.target.value as Visibility)}
			value={value}
		>
			<option value="public">Anyone</option>
			<option value="friends">Friends only</option>
			<option value="private">Only me</option>
		</select>
	);
}

/**
 * Top-level Curius section — not a generic "connected services" card. Curius
 * is the origin users are migrating from, first-class to Gloss identity.
 *
 * State flow:
 * - Not connected + extension detected → "Connect Curius" button that delegates
 *   to the extension via the web bridge (same mechanism as `/welcome`).
 * - Not connected + extension not detected → Install hint linking to /install.
 * - Connected → username, last sync, re-sync + disconnect controls.
 */
function CuriusSection() {
	const navigate = useNavigate();
	const status = useQuery(api.curius.getConnectionStatus);
	const disconnectMutation = useMutation(api.curius.disconnect);
	const [extensionPresent, setExtensionPresent] = useState<boolean | null>(
		null
	);
	const [syncing, setSyncing] = useState(false);
	const [connectPhase, setConnectPhase] = useState<
		"idle" | "contacting" | "waiting-for-login" | "finishing"
	>("idle");
	const pingedRef = useRef(false);

	// Warm the service worker once on mount so the subsequent action press
	// hits a hot SW. MV3 cold starts can otherwise dominate perceived
	// latency of the connect button.
	useEffect(() => {
		if (pingedRef.current) return;
		pingedRef.current = true;
		void pingExtension(3000).then(setExtensionPresent);
	}, []);

	const connected = status && "connected" in status && status.connected;
	const curiusUsername = connected ? status.curiusUsername : undefined;
	const lastImportFinishedAt = connected
		? status.lastImportFinishedAt
		: undefined;
	const lastImportStatus = connected ? status.lastImportStatus : undefined;
	const health = connected
		? curiusHealth({
				tokenExpiresAt: status.tokenExpiresAt,
				lastImportError: status.lastImportError,
			})
		: "healthy";
	const expiryCopy = connected
		? formatExpiryCountdown(status.tokenExpiresAt)
		: null;

	// When the backend flips to connected, settle the button state.
	useEffect(() => {
		if (connected && connectPhase !== "idle") setConnectPhase("idle");
	}, [connected, connectPhase]);

	async function onConnect() {
		setConnectPhase("contacting");
		const result = (await sendToExtension(
			{ type: "START_CONNECT" },
			5000
		)) as StartConnectResult | null;
		if (result === null) {
			setConnectPhase("idle");
			toast.error("Couldn't reach the extension. Make sure it's installed.");
			return;
		}
		if ("error" in result) {
			setConnectPhase("idle");
			toast.error(result.error);
			return;
		}
		setConnectPhase(
			result.mode === "already-connected" ? "finishing" : "waiting-for-login"
		);
	}

	async function onSync() {
		setSyncing(true);
		const result = await sendToExtension({ type: "RUN_IMPORT" }, 5000);
		setSyncing(false);
		if (result === null) {
			toast.error("Couldn't reach the extension. Make sure it's installed.");
		} else {
			toast.success("Import started");
		}
	}

	async function onDisconnect() {
		try {
			await disconnectMutation({});
			// Best-effort: tell the extension to drop its cached JWT + caches.
			// The extension's own caches eventually time out regardless.
			void sendToExtension({ type: "TOKEN_REVOKED" }, 3000);
			toast.success("Disconnected from Curius");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to disconnect");
		}
	}

	return (
		<section className="mb-10">
			<h2 className="mb-2 text-lg font-semibold text-foreground">Curius</h2>
			<p className="mb-6 text-sm text-muted-foreground">
				Your Curius account. Connect it to bring over your highlights and see
				friends who haven't moved yet.
			</p>

			{status === undefined && (
				<div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border">
					<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
				</div>
			)}

			{status !== undefined && !connected && (
				<div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						{extensionPresent === false ? (
							<>
								<p className="mb-1 text-sm font-medium text-foreground">
									Install the Gloss extension
								</p>
								<p className="text-sm text-muted-foreground">
									Connecting Curius runs through the browser extension.
								</p>
							</>
						) : connectPhase === "waiting-for-login" ? (
							<>
								<p className="mb-1 text-sm font-medium text-foreground">
									Sign in to Curius
								</p>
								<p className="text-sm text-muted-foreground">
									We opened a tab for you. We'll pick up your session as soon as
									you sign in.
								</p>
							</>
						) : connectPhase === "finishing" ? (
							<>
								<p className="mb-1 text-sm font-medium text-foreground">
									Finishing up
								</p>
								<p className="text-sm text-muted-foreground">
									Pulling your highlights into Gloss.
								</p>
							</>
						) : (
							<>
								<p className="mb-1 text-sm font-medium text-foreground">
									Connect Curius
								</p>
								<p className="text-sm text-muted-foreground">
									We'll connect with your logged-in Curius session.
								</p>
							</>
						)}
					</div>
					<div className="flex shrink-0 gap-2">
						{extensionPresent === false ? (
							<Button
								onClick={() => navigate({ to: "/install" })}
								type="button"
							>
								Install extension
							</Button>
						) : (
							<Button
								disabled={connectPhase !== "idle" || extensionPresent === null}
								onClick={onConnect}
								type="button"
							>
								{connectPhase === "contacting" ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Contacting…
									</>
								) : connectPhase === "waiting-for-login" ? (
									"Waiting for sign-in…"
								) : connectPhase === "finishing" ? (
									"Finishing…"
								) : (
									"Connect Curius"
								)}
							</Button>
						)}
					</div>
				</div>
			)}

			{status !== undefined && connected && (
				<div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<p className="truncate text-sm font-medium text-foreground">
							{curiusUsername ?? "Connected"}
						</p>
						<p className="text-xs text-muted-foreground">
							{health === "expired"
								? status.lastImportError === "token_expired"
									? "Session expired, reconnect to keep syncing"
									: "Curius session expired"
								: health === "expiring-soon"
									? (expiryCopy ?? "Reconnect soon")
									: lastImportStatus === "running"
										? "Import in progress…"
										: lastImportStatus === "failed"
											? `Import failed${
													status.lastImportError
														? `: ${status.lastImportError}`
														: ""
												}`
											: lastImportStatus === "stalled"
												? "Last import stalled, try again"
												: lastImportFinishedAt
													? `Last import ${new Date(
															lastImportFinishedAt
														).toLocaleDateString()}`
													: "Ready to import"}
						</p>
					</div>
					<div className="flex shrink-0 gap-2">
						{health === "expired" ? (
							<Button
								disabled={connectPhase !== "idle"}
								onClick={onConnect}
								type="button"
							>
								{connectPhase === "contacting" ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Contacting…
									</>
								) : connectPhase === "waiting-for-login" ? (
									"Waiting for sign-in…"
								) : connectPhase === "finishing" ? (
									"Finishing…"
								) : (
									"Reconnect"
								)}
							</Button>
						) : (
							<>
								{health === "expiring-soon" && (
									<Button
										disabled={connectPhase !== "idle"}
										onClick={onConnect}
										type="button"
										variant="outline"
									>
										Reconnect
									</Button>
								)}
								<Button
									disabled={syncing || lastImportStatus === "running"}
									onClick={onSync}
									type="button"
									variant="outline"
								>
									{syncing ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Syncing
										</>
									) : (
										"Re-sync"
									)}
								</Button>
							</>
						)}
						<Button onClick={onDisconnect} type="button" variant="ghost">
							Disconnect
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}
