import { buildCommand, type CommandContext } from "@stricli/core";
import chalk from "chalk";
import { runOAuthFlow } from "../../lib/oauth.js";

export const loginCommand = buildCommand({
	async func(this: CommandContext) {
		try {
			this.process.stdout.write(
				chalk.blue("Starting browser authentication flow...\n")
			);

			const result = await runOAuthFlow();

			this.process.stdout.write(
				chalk.green("\n✓ Successfully authenticated!\n")
			);
			this.process.stdout.write(
				`  API key saved with scope: ${chalk.cyan(result.scope)}\n`
			);
			this.process.stdout.write(`  Key ID: ${chalk.dim(result.keyId)}\n\n`);
			this.process.stdout.write(
				chalk.dim("You can now use gloss commands to access your library.\n")
			);
		} catch (error) {
			this.process.stderr.write(
				chalk.red(
					`\n✗ Authentication failed: ${error instanceof Error ? error.message : "Unknown error"}\n`
				)
			);
			process.exit(1);
		}
	},
	parameters: {},
	docs: {
		brief: "Authenticate with Gloss via browser",
		fullDescription:
			"Opens your browser to authenticate with Gloss. After logging in, an API key will be securely stored in ~/.config/gloss/config.json.",
	},
});
