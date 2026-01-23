import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
	component: RouteComponent,
});

function RouteComponent() {
	const [mode, setMode] = useState<"signin" | "signup">("signup");

	return (
		<div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-16">
			{/* Subtle warm glow behind the form */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute top-1/3 h-72 w-72 rounded-full bg-amber-100/30 blur-3xl dark:bg-amber-500/5"
			/>

			<div className="relative w-full max-w-sm">
				{/* Header */}
				<div className="mb-10 text-center">
					<h1 className="font-medium text-foreground text-lg tracking-tight">
						{mode === "signin" ? "Welcome back" : "Create an account"}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{mode === "signin"
							? "Sign in to continue to your highlights"
							: "Start capturing what resonates"}
					</p>
				</div>

				{/* Form */}
				{mode === "signin" ? (
					<SignInForm onSwitchToSignUp={() => setMode("signup")} />
				) : (
					<SignUpForm onSwitchToSignIn={() => setMode("signin")} />
				)}

				{/* Dev login panel */}
				{import.meta.env.DEV && <DevLoginPanel />}
			</div>
		</div>
	);
}

function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
	const navigate = useNavigate({ from: "/" });
	const { isPending } = authClient.useSession();

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			await authClient.signIn.email(
				{
					email: value.email,
					password: value.password,
				},
				{
					onSuccess: () => {
						navigate({ to: "/" });
						toast.success("Welcome back");
					},
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
				}
			);
		},
		validators: {
			onSubmit: z.object({
				email: z.email("Please enter a valid email"),
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
		},
	});

	if (isPending) {
		return (
			<div className="flex justify-center py-12">
				<Loader />
			</div>
		);
	}

	return (
		<form
			className="space-y-5"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
		>
			<form.Field name="email">
				{(field) => (
					<FormField error={field.state.meta.errors[0]?.message} label="Email">
						<Input
							autoComplete="email"
							className="h-10 rounded-lg text-sm"
							id={field.name}
							name={field.name}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							placeholder="you@example.com"
							type="email"
							value={field.state.value}
						/>
					</FormField>
				)}
			</form.Field>

			<form.Field name="password">
				{(field) => (
					<FormField
						error={field.state.meta.errors[0]?.message}
						label="Password"
					>
						<Input
							autoComplete="current-password"
							className="h-10 rounded-lg text-sm"
							id={field.name}
							name={field.name}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							type="password"
							value={field.state.value}
						/>
					</FormField>
				)}
			</form.Field>

			<form.Subscribe>
				{(state) => (
					<Button
						className="mt-2 h-10 w-full rounded-lg text-sm"
						disabled={!state.canSubmit || state.isSubmitting}
						type="submit"
					>
						{state.isSubmitting ? "Signing in..." : "Sign in"}
					</Button>
				)}
			</form.Subscribe>

			<p className="pt-4 text-center text-muted-foreground text-sm">
				Don't have an account?{" "}
				<button
					className="text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
					onClick={onSwitchToSignUp}
					type="button"
				>
					Sign up
				</button>
			</p>
		</form>
	);
}

function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
	const navigate = useNavigate({ from: "/" });
	const { isPending } = authClient.useSession();

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			await authClient.signUp.email(
				{
					email: value.email,
					password: value.password,
					name: value.name,
				},
				{
					onSuccess: () => {
						navigate({ to: "/" });
						toast.success("Welcome to Gloss");
					},
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
				}
			);
		},
		validators: {
			onSubmit: z.object({
				name: z.string().min(2, "Name must be at least 2 characters"),
				email: z.email("Please enter a valid email"),
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
		},
	});

	if (isPending) {
		return (
			<div className="flex justify-center py-12">
				<Loader />
			</div>
		);
	}

	return (
		<form
			className="space-y-5"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
		>
			<form.Field name="name">
				{(field) => (
					<FormField error={field.state.meta.errors[0]?.message} label="Name">
						<Input
							autoComplete="name"
							className="h-10 rounded-lg text-sm"
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

			<form.Field name="email">
				{(field) => (
					<FormField error={field.state.meta.errors[0]?.message} label="Email">
						<Input
							autoComplete="email"
							className="h-10 rounded-lg text-sm"
							id={field.name}
							name={field.name}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							placeholder="you@example.com"
							type="email"
							value={field.state.value}
						/>
					</FormField>
				)}
			</form.Field>

			<form.Field name="password">
				{(field) => (
					<FormField
						error={field.state.meta.errors[0]?.message}
						label="Password"
					>
						<Input
							autoComplete="new-password"
							className="h-10 rounded-lg text-sm"
							id={field.name}
							name={field.name}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							type="password"
							value={field.state.value}
						/>
					</FormField>
				)}
			</form.Field>

			<form.Subscribe>
				{(state) => (
					<Button
						className="mt-2 h-10 w-full rounded-lg text-sm"
						disabled={!state.canSubmit || state.isSubmitting}
						type="submit"
					>
						{state.isSubmitting ? "Creating account..." : "Create account"}
					</Button>
				)}
			</form.Subscribe>

			<p className="pt-4 text-center text-muted-foreground text-sm">
				Already have an account?{" "}
				<button
					className="text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
					onClick={onSwitchToSignIn}
					type="button"
				>
					Sign in
				</button>
			</p>
		</form>
	);
}

interface FormFieldProps {
	label: string;
	error?: string;
	children: React.ReactNode;
}

function FormField({ label, error, children }: FormFieldProps) {
	return (
		<div className="space-y-2">
			<Label className="font-normal text-muted-foreground text-xs">
				{label}
			</Label>
			{children}
			{error && (
				<p className="text-destructive text-xs" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}

const DEV_USERS = [
	{ email: "alice@example.com", name: "Alice Chen", context: "Primary user" },
	{ email: "bob@example.com", name: "Bob Martinez", context: "Alice's friend" },
	{
		email: "carol@example.com",
		name: "Carol Davis",
		context: "Alice's friend",
	},
	{ email: "dan@example.com", name: "Dan Wilson", context: "Pending → Alice" },
	{ email: "eve@example.com", name: "Eve Johnson", context: "No relation" },
] as const;

function DevLoginPanel() {
	const navigate = useNavigate({ from: "/" });
	const [loadingEmail, setLoadingEmail] = useState<string | null>(null);

	const loginAs = async (email: string) => {
		setLoadingEmail(email);
		await authClient.signIn.email(
			{ email, password: "password123" },
			{
				onSuccess: () => {
					navigate({ to: "/" });
					toast.success(`Logged in as ${email}`);
				},
				onError: (err) => {
					toast.error(
						err.error.message || "Login failed. Run `bun run db:seed` first."
					);
				},
			}
		);
		setLoadingEmail(null);
	};

	return (
		<div className="mt-8 rounded-lg border border-muted-foreground/30 border-dashed p-4">
			<p className="mb-3 text-muted-foreground text-xs">
				Dev Login{" "}
				<span className="text-muted-foreground/60">
					(run bun run db:seed first)
				</span>
			</p>
			<div className="grid grid-cols-1 gap-2">
				{DEV_USERS.map((user) => (
					<button
						className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
						disabled={loadingEmail !== null}
						key={user.email}
						onClick={() => loginAs(user.email)}
						type="button"
					>
						<span className="font-medium text-foreground">
							{loadingEmail === user.email ? "Signing in..." : user.name}
						</span>
						<span className="text-muted-foreground text-xs">
							{user.context}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}
