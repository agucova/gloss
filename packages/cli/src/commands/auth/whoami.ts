import { buildCommand, type CommandContext } from "@stricli/core";
import chalk from "chalk";
import { getCurrentUser } from "../../lib/api-client.js";
import { getApiKey } from "../../lib/config.js";

export const whoamiCommand = buildCommand({
	async func(this: CommandContext) {
		const apiKey = getApiKey();
		if (!apiKey) {
			this.process.stderr.write(
				chalk.yellow("Not logged in. Run 'gloss auth login' to authenticate.\n")
			);
			process.exit(1);
			return;
		}

		try {
			const user = await getCurrentUser();

			this.process.stdout.write(chalk.blue("Logged in as:\n\n"));
			this.process.stdout.write(`  Name:  ${chalk.bold(user.name)}\n`);
			this.process.stdout.write(`  Email: ${chalk.dim(user.email)}\n`);
			this.process.stdout.write(`  ID:    ${chalk.dim(user.id)}\n`);
		} catch (error) {
			this.process.stderr.write(
				chalk.red(
					`✗ Failed to get user info: ${error instanceof Error ? error.message : "Unknown error"}\n`
				)
			);
			process.exit(1);
		}
	},
	parameters: {},
	docs: {
		brief: "Show current authenticated user",
		fullDescription:
			"Displays information about the currently authenticated user, including their name, email, and user ID.",
	},
});
