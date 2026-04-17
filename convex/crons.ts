import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Sweep expired CLI auth pending rows once per hour. See
// convex/cliAuth.ts:cleanupExpired for the TTL policy.
crons.interval(
	"cleanup expired cli auth pending",
	{ hours: 1 },
	internal.cliAuth.cleanupExpired,
	{}
);

export default crons;
