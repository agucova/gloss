import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";

// Convex deployment URL — loaded from extension storage or defaults to dev
const DEFAULT_CONVEX_URL = "https://glorious-toad-644.convex.cloud";

let convexClient: ConvexHttpClient | null = null;

/**
 * Get or create the Convex HTTP client for the extension.
 * Uses ConvexHttpClient for one-shot queries (no WebSocket needed in background).
 */
export function getConvexClient(): ConvexHttpClient {
	if (!convexClient) {
		convexClient = new ConvexHttpClient(DEFAULT_CONVEX_URL);
	}
	return convexClient;
}

export { api };
export { DEFAULT_CONVEX_URL };
