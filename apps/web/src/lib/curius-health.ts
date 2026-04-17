/**
 * Web-side mirror of `apps/extension/utils/curius-health.ts`. Kept as a small
 * copy instead of a shared package because the logic is five lines and the
 * two consumers sit in different toolchains (extension is Solid + wxt, web is
 * React + vite). Promote to a package if a third caller appears.
 */

export const RECONNECT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type CuriusHealth = "healthy" | "expiring-soon" | "expired";

export interface CuriusHealthInput {
	tokenExpiresAt: number | undefined | null;
	lastImportError: string | undefined | null;
}

export function curiusHealth(
	input: CuriusHealthInput,
	now: number = Date.now()
): CuriusHealth {
	if (input.lastImportError === "token_expired") return "expired";
	if (typeof input.tokenExpiresAt === "number") {
		if (input.tokenExpiresAt <= now) return "expired";
		if (input.tokenExpiresAt - now <= RECONNECT_WINDOW_MS) {
			return "expiring-soon";
		}
	}
	return "healthy";
}

export function formatExpiryCountdown(
	tokenExpiresAt: number | undefined | null,
	now: number = Date.now()
): string | null {
	if (typeof tokenExpiresAt !== "number") return null;
	const remainingMs = tokenExpiresAt - now;
	if (remainingMs <= 0) return "Curius session expired";
	const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
	if (days <= 1) return "Expires in under a day";
	return `Expires in ${days} days`;
}
