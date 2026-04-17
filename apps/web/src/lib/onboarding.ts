/**
 * Shared onboarding flags. Stored in `localStorage` for v1 — simple, survives
 * re-auth on the same device, and lets returning users skip the welcome step
 * without a server round-trip. Promote to a user-record field if we need
 * cross-device persistence.
 */
export const WELCOME_DONE_KEY = "gloss.onboarding.welcomeDone";

export function hasCompletedWelcome(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return window.localStorage.getItem(WELCOME_DONE_KEY) === "1";
	} catch {
		return false;
	}
}

export function markWelcomeDone(): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(WELCOME_DONE_KEY, "1");
	} catch {
		// private mode / storage blocked — swallow
	}
}
