import { api } from "@convex/_generated/api";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export const Route = createFileRoute("/u/setup")({
	component: UsernameSetupPage,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			redirect({
				to: "/login",
				throw: true,
			});
		}
		return { session: session.data };
	},
});

function UsernameSetupPage() {
	const navigate = useNavigate();
	const [checkingUsername, setCheckingUsername] = useState("");
	const [debouncedUsername, setDebouncedUsername] = useState("");

	const profile = useQuery(api.users.getMe);
	const setUsernameMutation = useMutation(api.users.setUsername);

	// Check username availability
	const availability = useQuery(
		api.users.checkUsername,
		debouncedUsername.length >= 3 ? { username: debouncedUsername } : "skip"
	);

	// Redirect if user already has a username
	useEffect(() => {
		if (profile?.username) {
			navigate({ to: `/u/${profile.username}` });
		}
	}, [profile?.username, navigate]);

	// Debounce username check
	useEffect(() => {
		const timer = setTimeout(() => {
			if (checkingUsername.length >= 3) {
				setDebouncedUsername(checkingUsername);
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [checkingUsername]);

	const form = useForm({
		defaultValues: {
			username: "",
		},
		onSubmit: async ({ value }) => {
			try {
				await setUsernameMutation({ username: value.username.toLowerCase() });
				toast.success("Username set successfully!");
				navigate({ to: `/u/${value.username.toLowerCase()}` });
			} catch (err) {
				toast.error(
					err instanceof Error ? err.message : "Failed to set username"
				);
			}
		},
		validators: {
			onSubmit: z.object({
				username: z
					.string()
					.min(3, "Username must be at least 3 characters")
					.max(20, "Username must be at most 20 characters")
					.regex(
						USERNAME_PATTERN,
						"Username can only contain letters, numbers, and underscores"
					),
			}),
		},
	});

	if (profile === undefined) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
				<Loader />
			</div>
		);
	}

	const isAvailable = availability?.available;
	const checkingAvailability =
		debouncedUsername.length >= 3 && availability === undefined;
	const showAvailability =
		debouncedUsername.length >= 3 && !checkingAvailability;

	return (
		<div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-16">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute top-1/3 h-72 w-72 rounded-full bg-amber-100/30 blur-3xl dark:bg-amber-500/5"
			/>

			<div className="relative w-full max-w-sm">
				<div className="mb-10 text-center">
					<h1 className="text-lg font-medium tracking-tight text-foreground">
						Choose your username
					</h1>
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						This will be your profile URL: gloss.agus.sh/u/
						<span className="font-medium text-foreground">
							{checkingUsername || "username"}
						</span>
					</p>
				</div>

				<form
					className="space-y-5"
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					<form.Field name="username">
						{(field) => (
							<div className="space-y-2">
								<Label className="text-xs font-normal text-muted-foreground">
									Username
								</Label>
								<div className="relative">
									<Input
										autoComplete="username"
										className="h-10 rounded-lg text-sm"
										id={field.name}
										name={field.name}
										onBlur={field.handleBlur}
										onChange={(e) => {
											field.handleChange(e.target.value);
											setCheckingUsername(e.target.value);
										}}
										placeholder="your_username"
										value={field.state.value}
									/>
									{checkingAvailability && (
										<div className="absolute top-1/2 right-3 -translate-y-1/2">
											<Loader className="h-4 w-4" inline />
										</div>
									)}
								</div>

								{showAvailability && (
									<p
										className={cn(
											"text-xs",
											isAvailable ? "text-green-600" : "text-destructive"
										)}
									>
										{isAvailable
											? "Username is available"
											: "Username is already taken"}
									</p>
								)}

								{field.state.meta.errors[0]?.message && (
									<p className="text-xs text-destructive" role="alert">
										{field.state.meta.errors[0].message}
									</p>
								)}
							</div>
						)}
					</form.Field>

					<form.Subscribe>
						{(state) => (
							<Button
								className="mt-2 h-10 w-full rounded-lg text-sm"
								disabled={
									!state.canSubmit || state.isSubmitting || !isAvailable
								}
								type="submit"
							>
								{state.isSubmitting ? "Setting username..." : "Claim username"}
							</Button>
						)}
					</form.Subscribe>
				</form>

				<p className="mt-6 text-center text-xs text-muted-foreground">
					You can change your username later in your profile settings.
				</p>
			</div>
		</div>
	);
}
