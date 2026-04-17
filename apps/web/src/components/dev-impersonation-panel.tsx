// Dev impersonation panel. Shown on /login when VITE_DEV_IMPERSONATION is
// enabled. Kept in its own module so production builds can tree-shake the
// whole thing — login.tsx imports this lazily behind a static flag, so in
// prod the dynamic import is unreferenced and Rollup drops this file from
// the bundle entirely.

import { useNavigate } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

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

export function DevImpersonationPanel() {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const [loading, setLoading] = useState<string | null>(null);
	const [magicLinkLoading, setMagicLinkLoading] = useState(false);

	const isAdmin = session?.user?.id === DEV_USERS[0].id;
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

	if (!session?.user) {
		const adminUser = DEV_USERS[0];
		return (
			<div className="mt-8 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-4">
				<p className="mb-3 text-xs font-medium text-amber-600 dark:text-amber-400">
					Dev Mode
				</p>
				<p className="mb-3 text-xs text-muted-foreground">
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

	if (!(isAdmin || isImpersonating)) {
		return null;
	}

	return (
		<div className="mt-8 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-4">
			<p className="mb-3 text-xs font-medium text-amber-600 dark:text-amber-400">
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
					<p className="mb-2 text-xs text-muted-foreground">
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
								<span className="text-xs text-muted-foreground">
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
