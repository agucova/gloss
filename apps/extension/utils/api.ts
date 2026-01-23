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
		console.log("[Gloss API] Getting server URL from storage...");
		const result = await browser.storage.sync.get("serverUrl");
		console.log("[Gloss API] Storage result:", result);
		return (result.serverUrl as string) || DEFAULT_SERVER_URL;
	} catch (error) {
		console.error("[Gloss API] Storage error:", error);
		return DEFAULT_SERVER_URL;
	}
}

/**
 * Create an Eden Treaty client for the Gloss API.
 * Should be called fresh for each request to pick up any URL changes.
 */
export async function createApiClient() {
	console.log("[Gloss API] Creating API client...");
	const serverUrl = await getServerUrl();
	console.log("[Gloss API] Server URL:", serverUrl);
	const client = treaty<App>(serverUrl, {
		fetch: {
			credentials: "include",
		},
	});
	console.log("[Gloss API] Client created");
	return client;
}

/**
 * Type alias for the API client.
 */
export type ApiClient = Awaited<ReturnType<typeof createApiClient>>;
