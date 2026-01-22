/**
 * Normalize a URL for consistent storage and lookup.
 * - Removes fragment (hash)
 * - Removes common tracking parameters
 * - Lowercases the hostname
 * - Removes trailing slash from path
 */
export function normalizeUrl(urlString: string): string {
	const url = new URL(urlString);

	// Lowercase the hostname
	url.hostname = url.hostname.toLowerCase();

	// Remove fragment
	url.hash = "";

	// Remove common tracking parameters
	const trackingParams = [
		"utm_source",
		"utm_medium",
		"utm_campaign",
		"utm_term",
		"utm_content",
		"fbclid",
		"gclid",
		"ref",
		"source",
	];
	for (const param of trackingParams) {
		url.searchParams.delete(param);
	}

	// Sort remaining search params for consistency
	url.searchParams.sort();

	// Remove trailing slash from pathname (unless it's just "/")
	if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
		url.pathname = url.pathname.slice(0, -1);
	}

	return url.toString();
}

/**
 * Generate a SHA-256 hash of a URL for efficient indexing.
 * Uses the Web Crypto API for hashing.
 */
export async function hashUrl(url: string): Promise<string> {
	const normalizedUrl = normalizeUrl(url);
	const encoder = new TextEncoder();
	const data = encoder.encode(normalizedUrl);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
