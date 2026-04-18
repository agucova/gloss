import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import lucidePreprocess from "vite-plugin-lucide-preprocess";

export default defineConfig(() => ({
	plugins: [
		lucidePreprocess(),
		tailwindcss(),
		tanstackRouter({ autoCodeSplitting: true }),
		react(),
	],
	// Load .env from monorepo root
	envDir: path.resolve(__dirname, "../.."),
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@convex": path.resolve(__dirname, "../../convex"),
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
