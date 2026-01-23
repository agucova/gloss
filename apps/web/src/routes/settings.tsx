import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

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

interface Settings {
	profileVisibility: Visibility;
	highlightsVisibility: Visibility;
	bookmarksVisibility: Visibility;
	highlightDisplayFilter: HighlightDisplayFilter;
	commentDisplayMode: CommentDisplayMode;
}

function SettingsPage() {
	const queryClient = useQueryClient();

	const {
		data: settings,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["user", "settings"],
		queryFn: async () => {
			const { data, error } = await api.api.users.me.settings.get();
			if (error) {
				throw new Error("Failed to load settings");
			}
			return data as Settings;
		},
	});

	const updateSettings = useMutation({
		mutationFn: async (data: Partial<Settings>) => {
			const { error } = await api.api.users.me.settings.patch(data);
			if (error) {
				const errObj = error as { error?: string };
				throw new Error(errObj.error ?? "Failed to update settings");
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["user", "settings"] });
			toast.success("Settings saved");
		},
		onError: (err) => toast.error(err.message),
	});

	const form = useForm({
		defaultValues: {
			profileVisibility: settings?.profileVisibility ?? "public",
			highlightsVisibility: settings?.highlightsVisibility ?? "friends",
			bookmarksVisibility: settings?.bookmarksVisibility ?? "public",
			highlightDisplayFilter: settings?.highlightDisplayFilter ?? "friends",
			commentDisplayMode: settings?.commentDisplayMode ?? "collapsed",
		},
		onSubmit: async ({ value }) => {
			await updateSettings.mutateAsync(value);
		},
	});

	// Update form when settings load
	if (settings && !form.state.isDirty) {
		form.reset({
			profileVisibility: settings.profileVisibility,
			highlightsVisibility: settings.highlightsVisibility,
			bookmarksVisibility: settings.bookmarksVisibility,
			highlightDisplayFilter: settings.highlightDisplayFilter,
			commentDisplayMode: settings.commentDisplayMode,
		});
	}

	if (isLoading) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6">
				<h1 className="mb-2 font-medium text-foreground text-lg">
					Failed to load settings
				</h1>
				<p className="mb-4 text-muted-foreground text-sm">
					Something went wrong. Please try again.
				</p>
				<Button
					onClick={() =>
						queryClient.invalidateQueries({ queryKey: ["user", "settings"] })
					}
					variant="outline"
				>
					Retry
				</Button>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
			{/* Header with back link */}
			<div className="mb-8">
				<Link
					className="mb-4 inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
					to="/profile"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to profile
				</Link>
				<h1 className="font-semibold text-2xl text-foreground">Settings</h1>
			</div>

			<form
				className="space-y-10"
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				{/* Privacy Settings */}
				<section>
					<h2 className="mb-6 font-semibold text-foreground text-lg">
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

				{/* Display Preferences */}
				<section>
					<h2 className="mb-6 font-semibold text-foreground text-lg">
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
										className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
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
										className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
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

				{/* Save button */}
				<div className="border-border border-t pt-6">
					<form.Subscribe>
						{(state) => (
							<div className="flex items-center justify-between">
								<p className="text-muted-foreground text-sm">
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
				<p className="text-foreground text-sm">{title}</p>
				<p className="text-muted-foreground text-xs">{description}</p>
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
			className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
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
