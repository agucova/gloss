/**
 * Client-side environment variables.
 * Uses import.meta.env directly so Vite replaces values at build time.
 */
export const env = {
	VITE_SERVER_URL: import.meta.env.VITE_SERVER_URL as string,
} as const;

// Validate at runtime
if (!env.VITE_SERVER_URL) {
	throw new Error("VITE_SERVER_URL environment variable is not set");
}
