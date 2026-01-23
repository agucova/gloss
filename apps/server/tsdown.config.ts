import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
	clean: true,
	// Bundle everything except native modules
	noExternal: [/.*/],
	external: ["pg-native", "better-sqlite3"],
});
