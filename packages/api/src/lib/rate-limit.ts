import { Elysia } from "elysia";
import type { AuthContext } from "./auth";

interface RateLimitConfig {
	windowMs: number;
	maxRequests: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
	api_key_read: { windowMs: 60_000, maxRequests: 100 },
	api_key_write: { windowMs: 60_000, maxRequests: 30 },
	session: { windowMs: 60_000, maxRequests: 200 },
};

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

// In-memory rate limit store
// Note: This is per-process, so won't work perfectly with multiple server instances
// For production with multiple instances, use Redis
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically (every 5 minutes)
setInterval(
	() => {
		const now = Date.now();
		for (const [key, entry] of rateLimitStore.entries()) {
			if (entry.resetAt < now) {
				rateLimitStore.delete(key);
			}
		}
	},
	5 * 60 * 1000
);

/**
 * Check rate limit for an identifier.
 * Returns whether the request is allowed and rate limit metadata.
 */
export function checkRateLimit(
	identifier: string,
	limitType: keyof typeof RATE_LIMITS
): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
	const config = RATE_LIMITS[limitType];
	const now = Date.now();

	let entry = rateLimitStore.get(identifier);

	if (!entry || entry.resetAt < now) {
		entry = { count: 0, resetAt: now + config.windowMs };
		rateLimitStore.set(identifier, entry);
	}

	entry.count++;

	return {
		allowed: entry.count <= config.maxRequests,
		remaining: Math.max(0, config.maxRequests - entry.count),
		resetAt: entry.resetAt,
		limit: config.maxRequests,
	};
}

/**
 * Rate limiting plugin for Elysia.
 * Must be used after authPlugin/deriveAuth.
 *
 * Applies rate limits based on auth method:
 * - API key (read): 100 req/min
 * - API key (write): 30 req/min
 * - Session: 200 req/min
 */
export const rateLimitPlugin = new Elysia({ name: "rateLimit" }).onBeforeHandle(
	({ session, authMethod, apiKeyId, apiKeyScope, set, request }) => {
		// Skip rate limiting for unauthenticated requests
		// (they'll fail auth anyway)
		if (!session) {
			return;
		}

		// Determine identifier and limit type
		let identifier: string;
		let limitType: keyof typeof RATE_LIMITS;

		if (authMethod === "api_key" && apiKeyId) {
			identifier = `api_key:${apiKeyId}`;
			// Use write limits for mutating requests
			const method = request.method.toUpperCase();
			if (
				method === "POST" ||
				method === "PUT" ||
				method === "PATCH" ||
				method === "DELETE"
			) {
				limitType = "api_key_write";
			} else {
				limitType = "api_key_read";
			}
		} else {
			// Session auth
			identifier = `session:${session.user.id}`;
			limitType = "session";
		}

		const result = checkRateLimit(identifier, limitType);

		// Set rate limit headers
		set.headers["X-RateLimit-Limit"] = String(result.limit);
		set.headers["X-RateLimit-Remaining"] = String(result.remaining);
		set.headers["X-RateLimit-Reset"] = String(result.resetAt);

		if (!result.allowed) {
			set.status = 429;
			set.headers["Retry-After"] = String(
				Math.ceil((result.resetAt - Date.now()) / 1000)
			);
			return { error: "Rate limit exceeded" };
		}
	}
);

/**
 * Derive function for rate limiting.
 * Use this with .derive() after auth derivation.
 */
export function deriveRateLimit(
	ctx: AuthContext & { request: Request; set: any }
) {
	if (!ctx.session) {
		return { rateLimit: null };
	}

	let identifier: string;
	let limitType: keyof typeof RATE_LIMITS;

	if (ctx.authMethod === "api_key" && ctx.apiKeyId) {
		identifier = `api_key:${ctx.apiKeyId}`;
		const method = ctx.request.method.toUpperCase();
		if (
			method === "POST" ||
			method === "PUT" ||
			method === "PATCH" ||
			method === "DELETE"
		) {
			limitType = "api_key_write";
		} else {
			limitType = "api_key_read";
		}
	} else {
		identifier = `session:${ctx.session.user.id}`;
		limitType = "session";
	}

	const result = checkRateLimit(identifier, limitType);

	// Set rate limit headers
	ctx.set.headers["X-RateLimit-Limit"] = String(result.limit);
	ctx.set.headers["X-RateLimit-Remaining"] = String(result.remaining);
	ctx.set.headers["X-RateLimit-Reset"] = String(result.resetAt);

	if (!result.allowed) {
		ctx.set.status = 429;
		ctx.set.headers["Retry-After"] = String(
			Math.ceil((result.resetAt - Date.now()) / 1000)
		);
	}

	return {
		rateLimit: {
			...result,
		},
	};
}
