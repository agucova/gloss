import { ConvexReactClient } from "convex/react";

/**
 * Convex React client.
 * Replaces the Eden Treaty client + TanStack Query setup.
 */
export const convex = new ConvexReactClient(
	import.meta.env.VITE_CONVEX_URL as string,
	{
		// Auth is handled by ConvexBetterAuthProvider
	}
);
