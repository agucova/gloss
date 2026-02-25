import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

// Validation patterns
const TWITTER_HANDLE_PATTERN = /^[a-zA-Z0-9_]{0,15}$/;
const GITHUB_HANDLE_PATTERN = /^[a-zA-Z0-9-]{0,39}$/;

interface ProfileEditModalProps {
	profile: {
		id: string;
		name: string;
		username: string | null;
		bio: string | null;
		website: string | null;
		twitterHandle: string | null;
		githubHandle: string | null;
		bookmarksVisibility?: "public" | "friends" | "private" | null;
	};
}

export function ProfileEditModal({ profile }: ProfileEditModalProps) {
	const [isOpen, setIsOpen] = useState(false);
	const queryClient = useQueryClient();

	// Listen for open event
	useEffect(() => {
		const handleOpen = () => setIsOpen(true);
		window.addEventListener("open-profile-edit-modal", handleOpen);
		return () =>
			window.removeEventListener("open-profile-edit-modal", handleOpen);
	}, []);

	// Close on escape
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsOpen(false);
			}
		};
		if (isOpen) {
			document.addEventListener("keydown", handleEscape);
			return () => document.removeEventListener("keydown", handleEscape);
		}
	}, [isOpen]);

	// Update profile mutation
	const updateProfile = useMutation({
		mutationFn: async (data: {
			name?: string;
			bio?: string;
			website?: string;
			twitterHandle?: string;
			githubHandle?: string;
			bookmarksVisibility?: "public" | "friends" | "private";
		}) => {
			const { error } = await api.api.users.me.patch(data);
			if (error) {
				const errObj = error as { error?: string };
				throw new Error(errObj.error ?? "Failed to update profile");
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["user"] });
			toast.success("Profile updated");
			setIsOpen(false);
		},
		onError: (err) => toast.error(err.message),
	});

	const form = useForm({
		defaultValues: {
			name: profile.name,
			bio: profile.bio ?? "",
			website: profile.website ?? "",
			twitterHandle: profile.twitterHandle ?? "",
			githubHandle: profile.githubHandle ?? "",
			bookmarksVisibility: profile.bookmarksVisibility ?? "public",
		},
		onSubmit: async ({ value }) => {
			await updateProfile.mutateAsync({
				name: value.name,
				bio: value.bio || undefined,
				website: value.website || undefined,
				twitterHandle: value.twitterHandle || undefined,
				githubHandle: value.githubHandle || undefined,
				bookmarksVisibility: value.bookmarksVisibility as
					| "public"
					| "friends"
					| "private",
			});
		},
		validators: {
			onSubmit: z.object({
				name: z.string().min(1, "Name is required").max(100),
				bio: z.string().max(280, "Bio must be 280 characters or less"),
				website: z.union([z.string().url("Invalid URL"), z.literal("")]),
				twitterHandle: z.union([
					z.string().regex(TWITTER_HANDLE_PATTERN, "Invalid Twitter handle"),
					z.literal(""),
				]),
				githubHandle: z.union([
					z.string().regex(GITHUB_HANDLE_PATTERN, "Invalid GitHub username"),
					z.literal(""),
				]),
				bookmarksVisibility: z.enum(["public", "friends", "private"]),
			}),
		},
	});

	if (!isOpen) {
		return null;
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape key is handled via document-level keydown listener
		// biome-ignore lint/a11y/noStaticElementInteractions: Backdrop overlay dismisses dialog on click
		// biome-ignore lint/a11y/noNoninteractiveElementInteractions: Backdrop overlay dismisses dialog on click
		<div
			className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/50 p-4 duration-150 fade-in"
			onClick={() => setIsOpen(false)}
		>
			{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: Dialog content area needs stopPropagation */}
			<div
				aria-labelledby="edit-profile-title"
				aria-modal="true"
				className="w-full max-w-md animate-in rounded-xl border border-border bg-background p-6 shadow-lg duration-150 zoom-in-95 fade-in"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="dialog"
			>
				<div className="mb-6 flex items-center justify-between">
					<h2
						className="text-lg font-semibold text-foreground"
						id="edit-profile-title"
					>
						Edit Profile
					</h2>
					<button
						aria-label="Close dialog"
						className="-m-2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						onClick={() => setIsOpen(false)}
						type="button"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					<form.Field name="name">
						{(field) => (
							<FormField
								error={field.state.meta.errors[0]?.message}
								label="Name"
							>
								<Input
									className="h-9 rounded-lg"
									id={field.name}
									name={field.name}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="Your name"
									value={field.state.value}
								/>
							</FormField>
						)}
					</form.Field>

					<form.Field name="bio">
						{(field) => (
							<FormField
								error={field.state.meta.errors[0]?.message}
								label="Bio"
							>
								<textarea
									className="flex min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30"
									id={field.name}
									maxLength={280}
									name={field.name}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="A short bio about yourself"
									value={field.state.value}
								/>
								<p className="mt-1 flex justify-between text-xs text-muted-foreground">
									<span className="flex items-center gap-1">
										<svg
											aria-hidden="true"
											className="h-3.5 w-3.5"
											fill="currentColor"
											viewBox="0 0 16 16"
										>
											<path d="M14 3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h12zM2 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2z" />
											<path d="M9.146 8.146a.5.5 0 0 1 .708 0L11.5 9.793l1.646-1.647a.5.5 0 0 1 .708.708l-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 0 1 0-.708z" />
											<path d="M11.5 5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 1 .5-.5z" />
											<path d="M3.56 11V5.01h1.064l1.216 3.376 1.208-3.376h1.064V11H7.12V6.78L5.872 10.16H5.208L3.96 6.78V11H3.56z" />
										</svg>
										Markdown supported
									</span>
									<span>{field.state.value.length}/280</span>
								</p>
							</FormField>
						)}
					</form.Field>

					<form.Field name="website">
						{(field) => (
							<FormField
								error={field.state.meta.errors[0]?.message}
								label="Website"
							>
								<Input
									className="h-9 rounded-lg"
									id={field.name}
									name={field.name}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="https://yourwebsite.com"
									type="url"
									value={field.state.value}
								/>
							</FormField>
						)}
					</form.Field>

					<form.Field name="twitterHandle">
						{(field) => (
							<FormField
								error={field.state.meta.errors[0]?.message}
								label="Twitter"
							>
								<div className="flex">
									<span className="flex h-9 items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
										@
									</span>
									<Input
										className="h-9 flex-1 rounded-l-none rounded-r-lg"
										id={field.name}
										name={field.name}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="username"
										value={field.state.value}
									/>
								</div>
							</FormField>
						)}
					</form.Field>

					<form.Field name="githubHandle">
						{(field) => (
							<FormField
								error={field.state.meta.errors[0]?.message}
								label="GitHub"
							>
								<div className="flex">
									<span className="flex h-9 items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
										@
									</span>
									<Input
										className="h-9 flex-1 rounded-l-none rounded-r-lg"
										id={field.name}
										name={field.name}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="username"
										value={field.state.value}
									/>
								</div>
							</FormField>
						)}
					</form.Field>

					<form.Field name="bookmarksVisibility">
						{(field) => (
							<FormField
								error={field.state.meta.errors[0]?.message}
								label="Bookmark visibility"
							>
								<select
									className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
									id={field.name}
									name={field.name}
									onBlur={field.handleBlur}
									onChange={(e) =>
										field.handleChange(
											e.target.value as "public" | "friends" | "private"
										)
									}
									value={field.state.value}
								>
									<option value="public">Public — Anyone can see</option>
									<option value="friends">
										Friends — Only friends can see
									</option>
									<option value="private">Private — Only you can see</option>
								</select>
							</FormField>
						)}
					</form.Field>

					<div className="flex gap-3 pt-4">
						<Button
							className="flex-1"
							onClick={() => setIsOpen(false)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<form.Subscribe>
							{(state) => (
								<Button
									className="flex-1"
									disabled={!state.canSubmit || state.isSubmitting}
									type="submit"
								>
									{state.isSubmitting ? "Saving..." : "Save"}
								</Button>
							)}
						</form.Subscribe>
					</div>
				</form>
			</div>
		</div>
	);
}

interface FormFieldProps {
	label: string;
	error?: string;
	children: React.ReactNode;
}

function FormField({ label, error, children }: FormFieldProps) {
	return (
		<div className="space-y-1.5">
			<Label className="text-xs font-normal text-muted-foreground">
				{label}
			</Label>
			{children}
			{error && (
				<p className="text-xs text-destructive" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
