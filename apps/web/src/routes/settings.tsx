import { api } from "@convex/_generated/api";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

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
