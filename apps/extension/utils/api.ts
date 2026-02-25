import type { App } from "server";

import { treaty } from "@elysiajs/eden";

const DEFAULT_SERVER_URL = "http://localhost:3000";

export { DEFAULT_SERVER_URL };

/**
 * Create an Eden Treaty client for the Gloss API.
 */
export function createApiClient() {
	return treaty<App>(DEFAULT_SERVER_URL, {
		fetch: {
			credentials: "include",
		},
	});
}

/**
 * Type alias for the API client.
 */
export type ApiClient = Awaited<ReturnType<typeof createApiClient>>;
