import { buildCommand, numberParser, type CommandContext } from "@stricli/core";
import chalk from "chalk";
import { listTags } from "../lib/api-client.js";
import { loadConfig } from "../lib/config.js";
import {
	formatJson,
	formatTagsCSV,
	formatTagsTable,
	type OutputFormat,
} from "../lib/output.js";

interface ListFlags {
	limit?: number;
	format?: OutputFormat;
}

export const tagsListCommand = buildCommand({
	async func(this: CommandContext, flags: ListFlags) {
		try {
			const config = loadConfig();
			const format = flags.format || config.defaultFormat;

			const response = await listTags(flags.limit);

			if (response.tags.length === 0) {
				this.process.stdout.write(chalk.yellow("No tags found.\n"));
				return;
			}

			let output: string;
			switch (format) {
				case "json":
					output = formatJson(response);
					break;
				case "csv":
					output = formatTagsCSV(response.tags);
					break;
				case "markdown":
					// Tags don't have a special markdown format, use table-like
					output = response.tags
						.map((t) => `- **${t.name}** (${t.isSystem ? "system" : "custom"})`)
						.join("\n");
					break;
				case "table":
				default:
					output = formatTagsTable(response.tags);
					break;
			}

			this.process.stdout.write(`${output}\n`);
		} catch (error) {
			this.process.stderr.write(
				chalk.red(
					`✗ Failed to list tags: ${error instanceof Error ? error.message : "Unknown error"}\n`
				)
			);
			process.exit(1);
		}
	},
	parameters: {
		flags: {
			limit: {
				kind: "parsed",
				parse: numberParser,
				brief: "Maximum results (default: 50)",
				optional: true,
			},
			format: {
				kind: "enum",
				values: ["json", "table", "csv", "markdown"],
				brief: "Output format",
				optional: true,
			},
		},
		aliases: {
			l: "limit",
			f: "format",
		},
	},
	docs: {
		brief: "List your tags",
		fullDescription: "Lists all tags you've created for organizing bookmarks.",
		customUsage: ["", "--format json"],
	},
});
