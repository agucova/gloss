import tailwindcss from "@tailwindcss/vite";
import { mkdirSync } from "node:fs";
import { defineConfig } from "wxt";

// Ensure dev browser profile directories exist so chrome-launcher doesn't fail
for (const dir of [".dev-chrome-profile", ".dev-firefox-profile"]) {
	mkdirSync(dir, { recursive: true });
}

// See https://wxt.dev/api/config.html
export default defineConfig({
	modules: ["@wxt-dev/module-react"],
	// Use port 5555 to avoid conflict with API server on port 3000
	dev: {
		server: {
			port: 5555,
		},
	},
	vite: () => ({
		plugins: [tailwindcss()],
	}),
	manifest: {
		name: "Gloss",
		description:
			"Highlight text on any webpage and share with friends. See what your friends are reading and highlighting across the web.",
		version: "0.1.0",
		permissions: ["storage", "activeTab", "cookies", "offscreen"],
		host_permissions: ["<all_urls>"],
		chrome_url_overrides: {
			newtab: "newtab.html",
		},
	},
	// Auto-open browser with extension loaded, navigate to web app
	webExt: {
		startUrls: ["http://localhost:3001"],
		chromiumProfile: ".dev-chrome-profile",
		firefoxProfile: ".dev-firefox-profile",
		keepProfileChanges: true,
	},
});
