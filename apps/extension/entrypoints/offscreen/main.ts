/**
 * Offscreen document for theme detection (Chrome MV3 only).
 *
 * Service workers don't have DOM access, so we use an offscreen document
 * to detect system color scheme via window.matchMedia.
 *
 * Based on https://github.com/Fefedu973/github-markdown-extension
 */

const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
let lastReportedScheme: string | null = null;

function reportColorScheme(force = false): void {
	const currentScheme = mediaQuery.matches ? "dark" : "light";

	if (!force && currentScheme === lastReportedScheme) return;
	lastReportedScheme = currentScheme;

	chrome.runtime
		.sendMessage({
			type: "COLOR_SCHEME",
			scheme: currentScheme,
			dark: mediaQuery.matches,
		})
		.catch(() => {
			// Reset so we retry next time
			lastReportedScheme = null;
		});
}

// Listen for theme detection requests from background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.action === "detect-theme") {
		reportColorScheme(true);
		sendResponse({ success: true });
		return true;
	}
	return false;
});

// Listen for system theme changes
mediaQuery.addEventListener("change", () => {
	reportColorScheme(true);
});

// Poll every second as fallback (change listener may not fire in offscreen)
setInterval(() => {
	const currentScheme = mediaQuery.matches ? "dark" : "light";
	if (currentScheme !== lastReportedScheme) {
		reportColorScheme(true);
	}
}, 1000);

// Report immediately on load
reportColorScheme(true);
