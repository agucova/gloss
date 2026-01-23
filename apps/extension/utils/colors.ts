/**
 * Generate a consistent HSL color from a user's name.
 * Used for friend highlights to give each user a distinct color.
 */
export function userHighlightColor(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		// biome-ignore lint/suspicious/noBitwiseOperators: intentional hash computation
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	const hue = Math.abs(hash) % 360;
	return `hsl(${hue}, 55%, 94%)`;
}

/**
 * Default highlight color for own highlights.
 * Warm yellow with transparency.
 */
export const OWN_HIGHLIGHT_COLOR = "rgba(254, 240, 138, 0.5)";

/**
 * CSS class for own highlights.
 */
export const OWN_HIGHLIGHT_CLASS = "gloss-highlight-own";

/**
 * CSS class for friend highlights.
 */
export const FRIEND_HIGHLIGHT_CLASS = "gloss-highlight-friend";
