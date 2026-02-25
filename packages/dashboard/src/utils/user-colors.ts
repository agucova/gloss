/**
 * Warm pastel color palette for friend indicators.
 * Chosen to be harmonious and colorblind-friendly.
 */
const FRIEND_COLORS = [
	"#F4A261", // sandy orange
	"#E9C46A", // warm yellow
	"#E76F51", // terracotta
	"#2A9D8F", // teal (contrast)
	"#D4A5A5", // dusty rose
	"#9DC88D", // sage
	"#C9B1FF", // lavender
	"#FFB4A2", // peach
];

/**
 * Generate a deterministic color for a user based on their ID.
 * The same user ID always maps to the same color.
 */
export function getUserColor(userId: string): string {
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		// biome-ignore lint/suspicious/noBitwiseOperators: hash algorithm requires bitwise operations
		hash = (hash << 5) - hash + userId.charCodeAt(i);
		// biome-ignore lint/suspicious/noBitwiseOperators: convert to 32-bit integer
		hash &= hash;
	}
	// Modular arithmetic guarantees a valid index into the non-empty array
	return FRIEND_COLORS[Math.abs(hash) % FRIEND_COLORS.length] as string;
}
