import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import Loader from "@/components/loader";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = useNavigate({ from: "/login" });

	// Get error from URL search params (optional, for OAuth error callbacks)
	const urlParams = new URLSearchParams(window.location.search);
	const error = urlParams.get("error");
	const { data: session, isPending } = authClient.useSession();
	const [magicLinkSent, setMagicLinkSent] = useState(false);
	const [socialLoading, setSocialLoading] = useState<string | null>(null);
	const [passkeyLoading, setPasskeyLoading] = useState(false);

	// Redirect if already logged in
	useEffect(() => {
		if (session?.user) {
			navigate({ to: "/" });
		}
	}, [session, navigate]);

	// Show error toast from OAuth callback
	useEffect(() => {
		if (error) {
			const errorMessages: Record<string, string> = {
				auth_failed: "Authentication failed. Please try again.",
				access_denied: "Access was denied. Please try again.",
				magic_link_failed: "Magic link expired or invalid. Please try again.",
				magic_link_expired: "Magic link has expired. Please request a new one.",
			};
			toast.error(errorMessages[error] ?? "Something went wrong.");
		}
	}, [error]);

	if (isPending) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
				<Loader />
			</div>
		);
	}

	const handleSocialLogin = async (provider: "google" | "apple") => {
		setSocialLoading(provider);
		try {
			await authClient.signIn.social({
				provider,
				callbackURL: `${window.location.origin}/`,
				errorCallbackURL: `${window.location.origin}/login?error=auth_failed`,
			});
		} catch {
			toast.error("Failed to connect. Please try again.");
			setSocialLoading(null);
		}
	};

	const handlePasskeyLogin = async () => {
		setPasskeyLoading(true);
		try {
			const result = await authClient.signIn.passkey();
			if (result?.error) {
				toast.error(result.error.message ?? "Passkey authentication failed.");
			} else {
				navigate({ to: "/" });
			}
		} catch {
			toast.error("Passkey authentication failed. Please try again.");
		} finally {
			setPasskeyLoading(false);
		}
	};

	if (magicLinkSent) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-16">
				<div className="relative w-full max-w-sm text-center">
					<div className="mb-6 flex justify-center">
						<div className="flex size-16 items-center justify-center rounded-full bg-muted">
							<MailIcon className="size-8 text-muted-foreground" />
						</div>
					</div>
					<h1 className="font-medium text-foreground text-lg tracking-tight">
						Check your email
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						We sent you a magic link to sign in. The link expires in 10 minutes.
					</p>
					<button
						className="mt-6 text-muted-foreground text-sm underline underline-offset-4 transition-colors hover:text-foreground"
						onClick={() => setMagicLinkSent(false)}
						type="button"
					>
						Use a different method
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-16">
			{/* Subtle warm glow behind the form */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute top-1/3 h-72 w-72 rounded-full bg-amber-100/30 blur-3xl dark:bg-amber-500/5"
			/>

			<div className="relative w-full max-w-sm">
				{/* Header */}
				<div className="mb-10 flex flex-col items-center">
					<Logo className="mb-4 h-10 w-auto text-foreground" />
					<p className="text-muted-foreground text-sm leading-relaxed">
						Capture what resonates
					</p>
				</div>

				{/* Social Login Buttons */}
				<div className="space-y-3">
					<Button
						className="h-10 w-full gap-3 rounded-lg font-normal text-sm"
						disabled={socialLoading !== null}
						onClick={() => handleSocialLogin("google")}
						type="button"
						variant="outline"
					>
						{socialLoading === "google" ? (
							<Loader className="size-4" inline />
						) : (
							<GoogleIcon className="size-4" />
						)}
						Continue with Google
					</Button>
					<Button
						className="h-10 w-full gap-3 rounded-lg font-normal text-sm"
						disabled={socialLoading !== null}
						onClick={() => handleSocialLogin("apple")}
						type="button"
						variant="outline"
					>
						{socialLoading === "apple" ? (
							<Loader className="size-4" inline />
						) : (
							<AppleIcon className="size-4" />
						)}
						Continue with Apple
					</Button>
				</div>

				{/* Divider */}
				<div className="relative my-8">
					<div className="absolute inset-0 flex items-center">
						<span className="w-full border-border border-t" />
					</div>
					<div className="relative flex justify-center text-xs">
						<span className="bg-background px-3 text-muted-foreground">or</span>
					</div>
				</div>

				{/* Magic Link Form */}
				<MagicLinkForm onSuccess={() => setMagicLinkSent(true)} />

				{/* Passkey Login */}
				<div className="mt-6 border-border border-t pt-6">
					<Button
						className="h-10 w-full gap-3 rounded-lg font-normal text-sm"
						disabled={passkeyLoading}
						onClick={handlePasskeyLogin}
						type="button"
						variant="ghost"
					>
						{passkeyLoading ? (
							<Loader className="size-4" inline />
						) : (
							<KeyIcon className="size-4" />
						)}
						Sign in with passkey
					</Button>
				</div>

				{/* Dev Impersonation Panel (only in dev mode) */}
				{import.meta.env.DEV && <DevImpersonationPanel />}
			</div>
		</div>
	);
}

function MagicLinkForm({ onSuccess }: { onSuccess: () => void }) {
	const form = useForm({
		defaultValues: {
			email: "",
		},
		onSubmit: async ({ value }) => {
			const result = await authClient.signIn.magicLink({
				email: value.email,
				callbackURL: `${window.location.origin}/`,
			});
			if (result?.error) {
				toast.error(result.error.message ?? "Failed to send magic link.");
			} else {
				onSuccess();
			}
		},
		validators: {
			onSubmit: z.object({
				email: z.string().email("Please enter a valid email"),
			}),
		},
	});

	return (
		<form
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
		>
			<div className="space-y-2">
				<Label
					className="font-normal text-muted-foreground text-xs"
					htmlFor="email"
				>
					Email
				</Label>
				<form.Field name="email">
					{(field) => (
						<>
							<Input
								autoComplete="email"
								className="h-10 rounded-lg text-sm"
								id="email"
								name={field.name}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="you@example.com"
								type="email"
								value={field.state.value}
							/>
							{field.state.meta.errors[0]?.message && (
								<p className="mt-1 text-destructive text-xs" role="alert">
									{field.state.meta.errors[0].message}
								</p>
							)}
						</>
					)}
				</form.Field>
			</div>

			<form.Subscribe>
				{(state) => (
					<Button
						className="h-10 w-full rounded-lg text-sm"
						disabled={!state.canSubmit || state.isSubmitting}
						type="submit"
					>
						{state.isSubmitting ? "Sending..." : "Send magic link"}
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}

// Icons

function GoogleIcon({ className }: { className?: string }) {
	return (
		<svg className={className} fill="currentColor" viewBox="0 0 24 24">
			<title>Google</title>
			<path
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
				fill="#4285F4"
			/>
			<path
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
				fill="#34A853"
			/>
			<path
				d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
				fill="#FBBC05"
			/>
			<path
				d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
				fill="#EA4335"
			/>
		</svg>
	);
}

function AppleIcon({ className }: { className?: string }) {
	return (
		<svg className={className} fill="currentColor" viewBox="0 0 24 24">
			<title>Apple</title>
			<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
		</svg>
	);
}

function MailIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
		>
			<title>Email</title>
			<rect height="16" rx="2" width="20" x="2" y="4" />
			<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
		</svg>
	);
}

function KeyIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
		>
			<title>Passkey</title>
			<circle cx="7.5" cy="15.5" r="5.5" />
			<path d="m21 2-9.6 9.6" />
			<path d="m15.5 7.5 3 3L22 7l-3-3" />
		</svg>
	);
}

// Dev impersonation panel (only visible in dev mode)

const DEV_USERS = [
	{
		id: "seed_agucova00000000000000",
		name: "Agustín Covarrubias",
		email: "gloss@agucova.dev",
		isAdmin: true,
	},
	{
		id: "seed_alice000000000000000",
		name: "Alice Chen",
		email: "alice@example.com",
	},
	{
		id: "seed_bob00000000000000000",
		name: "Bob Martinez",
		email: "bob@example.com",
	},
	{
		id: "seed_carol0000000000000000",
		name: "Carol Davis",
		email: "carol@example.com",
	},
	{
		id: "seed_dan00000000000000000",
		name: "Dan Wilson",
		email: "dan@example.com",
	},
	{
		id: "seed_eve00000000000000000",
		name: "Eve Johnson",
		email: "eve@example.com",
	},
] as const;

function DevImpersonationPanel() {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const [loading, setLoading] = useState<string | null>(null);
	const [magicLinkLoading, setMagicLinkLoading] = useState(false);

	// Check if current user is admin (Alice)
	const isAdmin = session?.user?.id === DEV_USERS[0].id;

	// Check if currently impersonating (session has impersonatedBy field)
	const isImpersonating = !!(session?.session as { impersonatedBy?: string })
		?.impersonatedBy;

	const handleImpersonate = async (userId: string) => {
		setLoading(userId);
		try {
			const result = await authClient.admin.impersonateUser({ userId });
			if (result.error) {
				toast.error("Impersonation failed");
			} else {
				const user = DEV_USERS.find((u) => u.id === userId);
				toast.success(`Now viewing as ${user?.name}`);
				navigate({ to: "/" });
			}
		} catch {
			toast.error("Impersonation failed");
		}
		setLoading(null);
	};

	const handleStopImpersonating = async () => {
		setLoading("stop");
		try {
			await authClient.admin.stopImpersonating();
			toast.success("Back to admin account");
		} catch {
			toast.error("Failed to stop impersonating");
		}
		setLoading(null);
	};

	const handleAdminMagicLink = async () => {
		setMagicLinkLoading(true);
		const adminUser = DEV_USERS[0];
		try {
			const result = await authClient.signIn.magicLink({
				email: adminUser.email,
				callbackURL: `${window.location.origin}/login`,
			});
			if (result?.error) {
				toast.error(result.error.message ?? "Failed to send magic link.");
			} else {
				toast.success(`Magic link sent to ${adminUser.email}`);
			}
		} catch {
			toast.error("Failed to send magic link.");
		}
		setMagicLinkLoading(false);
	};

	// Not logged in - show login as admin option
	if (!session?.user) {
		const adminUser = DEV_USERS[0];
		return (
			<div className="mt-8 rounded-lg border border-amber-500/50 border-dashed bg-amber-500/5 p-4">
				<p className="mb-3 font-medium text-amber-600 text-xs dark:text-amber-400">
					Dev Mode
				</p>
				<p className="mb-3 text-muted-foreground text-xs">
					Log in as admin ({adminUser.name.split(" ")[0]}) to access
					impersonation.
				</p>
				<Button
					className="w-full"
					disabled={magicLinkLoading}
					onClick={handleAdminMagicLink}
					size="sm"
					variant="outline"
				>
					{magicLinkLoading ? (
						<Loader className="mr-2 size-4" inline />
					) : (
						<MailIcon className="mr-2 size-4" />
					)}
					Send magic link to {adminUser.name.split(" ")[0]}
				</Button>
			</div>
		);
	}

	// Logged in but not as admin and not impersonating
	if (!(isAdmin || isImpersonating)) {
		return null;
	}

	// Logged in as admin or impersonating
	return (
		<div className="mt-8 rounded-lg border border-amber-500/50 border-dashed bg-amber-500/5 p-4">
			<p className="mb-3 font-medium text-amber-600 text-xs dark:text-amber-400">
				Dev Mode {isImpersonating && "• Impersonating"}
			</p>

			{isImpersonating && (
				<Button
					className="mb-3 w-full"
					disabled={loading === "stop"}
					onClick={handleStopImpersonating}
					size="sm"
					variant="outline"
				>
					{loading === "stop" && <Loader className="mr-2 size-4" inline />}
					Stop Impersonating
				</Button>
			)}

			{isAdmin && !isImpersonating && (
				<div className="space-y-2">
					<p className="mb-2 text-muted-foreground text-xs">
						Impersonate a test user:
					</p>
					{DEV_USERS.filter((u) => !("isAdmin" in u && u.isAdmin)).map(
						(user) => (
							<button
								className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
								disabled={loading !== null}
								key={user.id}
								onClick={() => handleImpersonate(user.id)}
								type="button"
							>
								<span className="font-medium">{user.name}</span>
								<span className="text-muted-foreground text-xs">
									{user.email}
								</span>
								{loading === user.id && (
									<Loader className="ml-2 size-4" inline />
								)}
							</button>
						)
					)}
				</div>
			)}
		</div>
	);
}
