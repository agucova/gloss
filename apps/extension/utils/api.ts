import { treaty } from "@elysiajs/eden";
import type { App } from "server";

/**
 * Default server URL. Can be overridden via extension storage.
 */
const DEFAULT_SERVER_URL = "http://localhost:3000";

/**
 * Get the configured server URL from extension storage.
 * Falls back to default if not configured.
 */
export async function getServerUrl(): Promise<string> {
	try {
		const result = await browser.storage.sync.get("serverUrl");
		return (result.serverUrl as string) || DEFAULT_SERVER_URL;
	} catch {
		return DEFAULT_SERVER_URL;
	}
}

/**
 * Create an Eden Treaty client for the Gloss API.
 * Uses default URL for now to avoid async issues in service workers.
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
