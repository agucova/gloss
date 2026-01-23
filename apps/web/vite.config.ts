import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
	plugins: [tailwindcss(), tanstackRouter({}), react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	define: {
		// Ensure VITE_SERVER_URL is defined for production builds
		...(mode === "production" && {
			"import.meta.env.VITE_SERVER_URL": JSON.stringify(
				"https://api.gloss.agus.sh"
			),
		}),
	},
	server: {
		port: 3001,
		watch: {
			// Ignore the auto-generated route tree to prevent infinite reload loops
			ignored: ["**/routeTree.gen.ts"],
		},
	},
}));
