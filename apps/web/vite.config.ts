import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(() => ({
	plugins: [tailwindcss(), tanstackRouter({}), react()],
	// Load .env from monorepo root
	envDir: path.resolve(__dirname, "../.."),
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		port: 3001,
		watch: {
			// Ignore the auto-generated route tree to prevent infinite reload loops
			ignored: ["**/routeTree.gen.ts"],
		},
	},
}));
