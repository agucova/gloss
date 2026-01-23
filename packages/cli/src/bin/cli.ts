import { run } from "@stricli/core";
import { app } from "../app.js";

// Run the CLI application
run(app, process.argv.slice(2), {
	process,
});
