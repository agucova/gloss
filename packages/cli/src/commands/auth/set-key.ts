import { buildCommand, type CommandContext } from "@stricli/core";
import chalk from "chalk";

import { setApiKey } from "../../lib/config.js";

export const setKeyCommand = buildCommand({
	func(this: CommandContext, _flags: Record<string, never>, apiKey: string) {
		if (!apiKey.startsWith("gloss_sk_")) {
			this.process.stderr.write(
				chalk.red(
					"✗ Invalid API key format. Keys should start with 'gloss_sk_'\n"
				)
			);
			process.exit(1);
			return;
		}

		setApiKey(apiKey);
		this.process.stdout.write(chalk.green("✓ API key saved successfully.\n"));
		this.process.stdout.write(
			chalk.dim("You can now use gloss commands to access your library.\n")
		);
	},
	parameters: {
		flags: {},
		positional: {
			kind: "tuple",
			parameters: [
				{
					brief: "The API key to set (format: gloss_sk_...)",
					parse: String,
					placeholder: "api-key",
				},
			],
		},
	},
	docs: {
		brief: "Set API key directly",
		fullDescription:
			"Manually set an API key for authentication. You can create API keys in the Gloss web app settings. The key will be stored in ~/.config/gloss/config.json.",
		customUsage: ["gloss_sk_abc123..."],
	},
});
