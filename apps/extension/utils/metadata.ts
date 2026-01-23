/**
 * Page metadata for rich link previews.
 */
export interface PageMetadata {
	title: string;
	url: string;
	favicon: string | null;
	ogImage: string | null;
	ogDescription: string | null;
	siteName: string | null;
}

/**
 * Extract metadata from the current page DOM.
 * This should be called from a content script context.
 */
export function extractPageMetadata(): PageMetadata {
	const url = window.location.href;
	const title = document.title || "";

	// Favicon: Check <link rel="icon"> variants, fallback to /favicon.ico
	const favicon = getFavicon();

	// Open Graph metadata
	const ogImage = getMetaContent("og:image") || getMetaContent("twitter:image");
	const ogDescription =
		getMetaContent("og:description") ||
		getMetaContent("description") ||
		getMetaContent("twitter:description");
	const siteName =
		getMetaContent("og:site_name") || getMetaContent("application-name");

	return {
		title,
		url,
		favicon,
		ogImage: ogImage ? resolveUrl(ogImage) : null,
		ogDescription,
		siteName,
	};
}

/**
 * Get meta tag content by property or name.
 */
function getMetaContent(nameOrProperty: string): string | null {
	// Try property first (Open Graph uses property)
	const byProperty = document.querySelector<HTMLMetaElement>(
		`meta[property="${nameOrProperty}"]`
	);
	if (byProperty?.content) {
		return byProperty.content;
	}

	// Try name (standard meta tags use name)
	const byName = document.querySelector<HTMLMetaElement>(
		`meta[name="${nameOrProperty}"]`
	);
	if (byName?.content) {
		return byName.content;
	}

	return null;
}

/**
 * Get the page favicon URL.
 */
function getFavicon(): string | null {
	// Check various link rel types for icons
	const iconSelectors = [
		'link[rel="icon"]',
		'link[rel="shortcut icon"]',
		'link[rel="apple-touch-icon"]',
		'link[rel="apple-touch-icon-precomposed"]',
	];

	for (const selector of iconSelectors) {
		const link = document.querySelector<HTMLLinkElement>(selector);
		if (link?.href) {
			return link.href;
		}
	}

	// Fallback to /favicon.ico
	try {
		const faviconUrl = new URL("/favicon.ico", window.location.origin);
		return faviconUrl.href;
	} catch {
		return null;
	}
}

/**
 * Resolve a potentially relative URL to an absolute URL.
 */
function resolveUrl(url: string): string {
	try {
		return new URL(url, window.location.href).href;
	} catch {
		return url;
	}
}
