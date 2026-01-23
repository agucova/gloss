import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		cli: "src/bin/cli.ts",
		mcp: "src/bin/mcp.ts",
		index: "src/index.ts",
	},
	format: ["esm"],
	target: "node20",
	clean: true,
	splitting: true,
	sourcemap: true,
	dts: true,
	shims: true,
	banner: {
		// Add shebang for CLI binaries
		js: "#!/usr/bin/env node",
	},
});
