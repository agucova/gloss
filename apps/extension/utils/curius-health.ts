/**
 * Shared health classifier for the Curius connection status. Used by the
 * popup and (via a mirror file) the web settings page to decide when to nag
 * about reconnect.
 *
 * We don't export a single "threshold in days" because the transition from
 * expiring-soon to expired isn't about a time boundary: it's about whether
 * Curius has already rejected the token (401 on an import) versus just being
 * close to its `exp`.
 */

/**
 * How long before hard expiry we start prompting the user. Curius JWTs are
 * 1y long; 30d gives several visits worth of room to auto-refresh via the
 * heartbeat before the hard-fail path kicks in.
 */
export const RECONNECT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type CuriusHealth = "healthy" | "expiring-soon" | "expired";

export interface CuriusHealthInput {
	tokenExpiresAt: number | undefined;
	lastImportError: string | undefined;
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

/** Friendly "expires in X days" copy. Returns `null` if expiry is unknown. */
export function formatExpiryCountdown(
	tokenExpiresAt: number | undefined,
	now: number = Date.now()
): string | null {
	if (typeof tokenExpiresAt !== "number") return null;
	const remainingMs = tokenExpiresAt - now;
	if (remainingMs <= 0) return "Curius session expired";
	const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
	if (days <= 1) return "Expires in under a day";
	return `Expires in ${days} days`;
}
