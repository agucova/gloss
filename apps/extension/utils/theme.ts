import { sendMessage } from "./messages";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

export async function getTheme(): Promise<Theme> {
	const result = await browser.storage.sync.get(STORAGE_KEY);
	return (result[STORAGE_KEY] as Theme) || "system";
}

/**
 * Persist the user's theme preference.
 *
 * Writes to local storage immediately (so other extension surfaces react),
 * then asks the background to push the change to Convex. Logged-out users
 * just get the local write — the mutation fails silently.
 */
export async function setTheme(theme: Theme): Promise<void> {
	await browser.storage.sync.set({ [STORAGE_KEY]: theme });
	try {
		await sendMessage({
			type: "UPDATE_THEME_PREFERENCE",
			themePreference: theme,
		});
	} catch (error) {
		console.error("[Gloss] Failed to push theme preference:", error);
	}
}

export function applyThemeTo(target: Element, theme: Theme): void {
	if (theme === "system") {
		const systemDark = window.matchMedia(
			"(prefers-color-scheme: dark)"
		).matches;
		target.classList.toggle("dark", systemDark);
	} else {
		target.classList.toggle("dark", theme === "dark");
	}
}

export function applyTheme(theme: Theme): void {
	applyThemeTo(document.documentElement, theme);
}

/**
 * Initialize theme for a specific element (e.g. shadow-DOM host).
 * Returns a cleanup function that removes all listeners.
 */
export async function initThemeFor(target: Element): Promise<() => void> {
	const theme = await getTheme();
	applyThemeTo(target, theme);

	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const onMediaChange = async () => {
		const current = await getTheme();
		if (current === "system") applyThemeTo(target, "system");
	};
	mediaQuery.addEventListener("change", onMediaChange);

	const onStorageChange = (
		changes: Record<string, { newValue?: unknown }>,
		areaName: string
	) => {
		if (areaName !== "sync") return;
		if (!changes[STORAGE_KEY]) return;
		const next =
			(changes[STORAGE_KEY].newValue as Theme | undefined) ?? "system";
		applyThemeTo(target, next);
	};
	browser.storage.onChanged.addListener(onStorageChange);

	return () => {
		mediaQuery.removeEventListener("change", onMediaChange);
		browser.storage.onChanged.removeListener(onStorageChange);
	};
}

/**
 * Initialize theme on page load — targets document.documentElement.
 * Use initThemeFor for shadow-DOM contexts.
 */
export async function initTheme(): Promise<void> {
	await initThemeFor(document.documentElement);
}

/**
 * Resolve an abstract preference ("light"/"dark"/"system") to a concrete mode.
 * Works in any context that has matchMedia (content script, popup, newtab).
 */
export function resolveTheme(theme: Theme): "light" | "dark" {
	if (theme !== "system") return theme;
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}
