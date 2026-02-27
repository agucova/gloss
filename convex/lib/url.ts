/**
 * Normalize a URL for consistent storage and lookup.
 * - Removes fragment (hash)
 * - Removes common tracking parameters
 * - Lowercases the hostname
 * - Removes trailing slash from path
 */
export function normalizeUrl(urlString: string): string {
	const url = new URL(urlString);

	url.hostname = url.hostname.toLowerCase();
	url.hash = "";

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

	url.searchParams.sort();

	if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
		url.pathname = url.pathname.slice(0, -1);
	}

	return url.toString();
}

/**
 * Generate a SHA-256 hash of a URL for efficient indexing.
 */
export async function hashUrl(url: string): Promise<string> {
	const normalizedUrl = normalizeUrl(url);
	const encoder = new TextEncoder();
	const data = encoder.encode(normalizedUrl);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extract the domain from a URL string.
 */
export function extractDomain(url: string): string {
	try {
		const parsed = new URL(url);
		return parsed.hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}
