export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

/**
 * Get the stored theme preference, defaulting to "system".
 */
export async function getTheme(): Promise<Theme> {
	const result = await browser.storage.sync.get(STORAGE_KEY);
	return (result[STORAGE_KEY] as Theme) || "system";
}

/**
 * Save the theme preference.
 */
export async function setTheme(theme: Theme): Promise<void> {
	await browser.storage.sync.set({ [STORAGE_KEY]: theme });
}

/**
 * Apply the theme to the document by toggling the "dark" class.
 */
export function applyTheme(theme: Theme): void {
	const root = document.documentElement;
	if (theme === "system") {
		const systemDark = window.matchMedia(
			"(prefers-color-scheme: dark)"
		).matches;
		root.classList.toggle("dark", systemDark);
	} else {
		root.classList.toggle("dark", theme === "dark");
	}
}

/**
 * Initialize theme on page load - call this early in your entry point.
 */
export async function initTheme(): Promise<void> {
	const theme = await getTheme();
	applyTheme(theme);

	// Listen for system theme changes when in "system" mode
	window
		.matchMedia("(prefers-color-scheme: dark)")
		.addEventListener("change", async () => {
			const currentTheme = await getTheme();
			if (currentTheme === "system") {
				applyTheme("system");
			}
		});
}
