import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";

import { components } from "../_generated/api";

const DAY = 24 * HOUR;

/**
 * App-level rate limits, all per-user unless otherwise noted.
 *
 * Numbers chosen to be generous for normal use but tight enough to stop
 * trivial abuse (e.g. a friend-request flood, a magic-link spam campaign
 * using someone else's inbox, a script DoS-ing the CLI authorize
 * endpoint). Token bucket lets short bursts through while still bounding
 * the long-run rate.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
	// Social actions
	friendRequestPerMinute: {
		kind: "token bucket",
		rate: 5,
		period: MINUTE,
		capacity: 5,
	},
	friendRequestPerDay: {
		kind: "fixed window",
		rate: 50,
		period: DAY,
	},
	commentCreate: {
		kind: "token bucket",
		rate: 10,
		period: MINUTE,
		capacity: 20,
	},
	highlightCreate: {
		kind: "token bucket",
		rate: 60,
		period: MINUTE,
		capacity: 120,
	},

	// Identity / account actions — allow room for fat-fingers but not abuse.
	usernameChange: {
		kind: "fixed window",
		rate: 5,
		period: HOUR,
	},

	// CLI authorize is keyed by IP (httpAction-level) — each request inserts
	// a row into cliAuthPending, so a script could otherwise fill the table.
	cliAuthorizePerIp: {
		kind: "fixed window",
		rate: 10,
		period: HOUR,
	},
});
