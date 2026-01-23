import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
	clean: true,
	// Bundle everything except native/problematic modules
	noExternal: [/.*/],
	external: ["pg", "pg-native", "better-sqlite3"],
});
