/** Generate a unique ID for highlights. */
export function generateId(): string {
	return `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
