import { buildCommand, numberParser, type CommandContext } from "@stricli/core";
import chalk from "chalk";
import { listBookmarks } from "../lib/api-client.js";
import { loadConfig } from "../lib/config.js";
import {
	formatBookmarksCSV,
	formatBookmarksMarkdown,
	formatBookmarksTable,
	formatJson,
	type OutputFormat,
} from "../lib/output.js";

interface ListFlags {
	limit?: number;
	format?: OutputFormat;
}

export const bookmarksListCommand = buildCommand({
	async func(this: CommandContext, flags: ListFlags) {
		try {
			const config = loadConfig();
			const format = flags.format || config.defaultFormat;

			const response = await listBookmarks({ limit: flags.limit });

			if (response.items.length === 0) {
				this.process.stdout.write(chalk.yellow("No bookmarks found.\n"));
				return;
			}

			let output: string;
			switch (format) {
				case "json":
					output = formatJson(response);
					break;
				case "csv":
					output = formatBookmarksCSV(response.items);
					break;
				case "markdown":
					output = formatBookmarksMarkdown(response.items);
					break;
				case "table":
				default:
					output = formatBookmarksTable(response.items);
					if (response.nextCursor) {
						this.process.stdout.write(
							chalk.dim("\n(More results available)\n\n")
						);
					}
					break;
			}

			this.process.stdout.write(`${output}\n`);
		} catch (error) {
			this.process.stderr.write(
				chalk.red(
					`✗ Failed to list bookmarks: ${error instanceof Error ? error.message : "Unknown error"}\n`
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
				brief: "Maximum results (default: 20)",
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
		brief: "List your bookmarks",
		fullDescription:
			"Lists your bookmarks in chronological order. Use --format to change output format.",
		customUsage: ["", "--limit 50 --format json"],
	},
});
