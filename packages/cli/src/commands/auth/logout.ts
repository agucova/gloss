import { buildCommand, type CommandContext } from "@stricli/core";
import chalk from "chalk";
import { clearApiKey, getApiKey } from "../../lib/config.js";

export const logoutCommand = buildCommand({
	func(this: CommandContext) {
		const currentKey = getApiKey();
		if (!currentKey) {
			this.process.stdout.write(chalk.yellow("You are not logged in.\n"));
			return;
		}

		clearApiKey();
		this.process.stdout.write(
			chalk.green("✓ Successfully logged out. API key removed.\n")
		);
	},
	parameters: {},
	docs: {
		brief: "Log out and clear stored credentials",
		fullDescription:
			"Removes the stored API key from ~/.config/gloss/config.json. You will need to log in again to use Gloss CLI.",
	},
});
