import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

// Validation pattern for usernames
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
	const queryClient = useQueryClient();
	const [checkingUsername, setCheckingUsername] = useState("");
	const [debouncedUsername, setDebouncedUsername] = useState("");

	// Check if user already has a username
	const { data: profile, isLoading: profileLoading } = useQuery({
		queryKey: ["user", "me"],
		queryFn: async () => {
			const { data, error } = await api.api.users.me.get();
			if (error) {
				throw new Error("Failed to fetch profile");
			}
			if (!data || "error" in data) {
				throw new Error("Failed to fetch profile");
			}
			return data;
		},
	});

	// Redirect if user already has a username
	useEffect(() => {
		if (profile?.username) {
			navigate({ to: `/u/${profile.username}` });
		}
	}, [profile?.username, navigate]);

	// Debounced username check
	useEffect(() => {
		const timer = setTimeout(() => {
			if (checkingUsername.length >= 3) {
				setDebouncedUsername(checkingUsername);
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [checkingUsername]);

	// Check username availability
	const { data: availabilityData, isFetching: checkingAvailability } = useQuery(
		{
			queryKey: ["username-availability", debouncedUsername],
			queryFn: async () => {
				if (!debouncedUsername) {
					return null;
				}
				const { data, error } = await api.api.users["check-username"]({
					username: debouncedUsername,
				}).get();
				if (error) {
					throw new Error("Failed to check username");
				}
				return data;
			},
			enabled: debouncedUsername.length >= 3,
		}
	);

	// Set username mutation
	const setUsernameMutation = useMutation({
		mutationFn: async (username: string) => {
			const { data, error } = await api.api.users.me.username.put({ username });
			if (error) {
				const errObj = error as { error?: string };
				throw new Error(errObj.error ?? "Failed to set username");
			}
			if (!data || (typeof data === "object" && "error" in data)) {
				throw new Error("Failed to set username");
			}
			return data as { username: string };
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["user"] });
			toast.success("Username set successfully!");
			navigate({ to: `/u/${data.username}` });
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const form = useForm({
		defaultValues: {
			username: "",
		},
		onSubmit: async ({ value }) => {
			await setUsernameMutation.mutateAsync(value.username.toLowerCase());
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

	if (profileLoading) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
				<Loader />
			</div>
		);
	}

	const isAvailable = availabilityData?.available;
	const showAvailability =
		debouncedUsername.length >= 3 && !checkingAvailability;

	return (
		<div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-16">
			{/* Subtle warm glow */}
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

								{/* Availability indicator */}
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

								{/* Validation error */}
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
									!state.canSubmit ||
									state.isSubmitting ||
									!isAvailable ||
									setUsernameMutation.isPending
								}
								type="submit"
							>
								{state.isSubmitting || setUsernameMutation.isPending
									? "Setting username..."
									: "Claim username"}
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
