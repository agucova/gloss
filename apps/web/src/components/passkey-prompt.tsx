import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const PASSKEY_PROMPT_DISMISSED_KEY = "gloss:passkey-prompt-dismissed";

export function PasskeyPrompt() {
	const { data: session } = authClient.useSession();
	const [visible, setVisible] = useState(false);
	const [isAdding, setIsAdding] = useState(false);

	useEffect(() => {
		if (!session?.user) {
			setVisible(false);
			return;
		}

		// Check if user has dismissed the prompt
		const dismissed = localStorage.getItem(PASSKEY_PROMPT_DISMISSED_KEY);
		if (dismissed) {
			return;
		}

		// Check if user already has a passkey
		const checkPasskeys = async () => {
			try {
				const result = await authClient.passkey.listUserPasskeys();
				if (result?.data && result.data.length > 0) {
					// User already has passkeys, don't show prompt
					return;
				}
				// Show prompt after a short delay for better UX
				const timer = setTimeout(() => setVisible(true), 1500);
				return () => clearTimeout(timer);
			} catch {
				// If we can't check passkeys, don't show the prompt
			}
		};

		checkPasskeys();
	}, [session?.user]);

	const handleAddPasskey = async () => {
		setIsAdding(true);
		try {
			const result = await authClient.passkey.addPasskey();
			if (result?.error) {
				toast.error(result.error.message ?? "Failed to add passkey.");
			} else {
				toast.success("Passkey added successfully!");
				setVisible(false);
			}
		} catch {
			toast.error("Failed to add passkey. Please try again.");
		} finally {
			setIsAdding(false);
		}
	};

	const handleDismiss = () => {
		localStorage.setItem(PASSKEY_PROMPT_DISMISSED_KEY, "true");
		setVisible(false);
	};

	if (!visible) {
		return null;
	}

	return (
		<div className="fade-in slide-in-from-bottom-4 fixed right-4 bottom-4 left-4 z-50 mx-auto max-w-sm animate-in duration-300 sm:left-auto">
			<div className="rounded-xl border border-border bg-background p-4 shadow-lg">
				<div className="flex items-start gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
						<KeyIcon className="size-5 text-muted-foreground" />
					</div>
					<div className="flex-1">
						<h3 className="font-medium text-foreground text-sm">
							Add a passkey for faster login
						</h3>
						<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
							Use Face ID, Touch ID, or your device PIN to sign in instantly
							next time.
						</p>
						<div className="mt-3 flex gap-2">
							<Button
								className="h-8 rounded-lg text-xs"
								disabled={isAdding}
								onClick={handleAddPasskey}
								size="sm"
							>
								{isAdding ? "Adding..." : "Add passkey"}
							</Button>
							<Button
								className="h-8 rounded-lg text-xs"
								disabled={isAdding}
								onClick={handleDismiss}
								size="sm"
								variant="ghost"
							>
								Maybe later
							</Button>
						</div>
					</div>
					<button
						aria-label="Dismiss"
						className="text-muted-foreground transition-colors hover:text-foreground"
						onClick={handleDismiss}
						type="button"
					>
						<XIcon className="size-4" />
					</button>
				</div>
			</div>
		</div>
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

function XIcon({ className }: { className?: string }) {
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
			<title>Close</title>
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</svg>
	);
}
