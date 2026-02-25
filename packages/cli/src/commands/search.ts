import { buildCommand, type CommandContext, numberParser } from "@stricli/core";
import chalk from "chalk";

import { search } from "../lib/api-client.js";
import { loadConfig } from "../lib/config.js";
import {
	formatJson,
	formatSearchCSV,
	formatSearchMarkdown,
	formatSearchTable,
	type OutputFormat,
} from "../lib/output.js";

interface SearchFlags {
	type?: string;
	tag?: string;
	url?: string;
	domain?: string;
	after?: string;
	before?: string;
	limit?: number;
	format?: string;
	sortBy?: string;
	mode?: string;
}

export const searchCommand = buildCommand({
	async func(this: CommandContext, flags: SearchFlags, query: string) {
		try {
			const config = loadConfig();
			const format = (flags.format || config.defaultFormat) as OutputFormat;

			// Parse types
			const types = flags.type?.split(",").map((t) => t.trim());

			const response = await search({
				query,
				types,
				tagName: flags.tag,
				url: flags.url,
				domain: flags.domain,
				after: flags.after,
				before: flags.before,
				limit: flags.limit,
				sortBy: flags.sortBy as "relevance" | "created" | undefined,
				mode: flags.mode as "hybrid" | "fts" | "semantic" | undefined,
			});

			if (response.results.length === 0) {
				this.process.stdout.write(
					chalk.yellow(`No results found for "${query}"\n`)
				);
				return;
			}

			let output: string;
			switch (format) {
				case "json":
					output = formatJson(response);
					break;
				case "csv":
					output = formatSearchCSV(response.results);
					break;
				case "markdown":
					output = formatSearchMarkdown(response.results);
					break;
				case "table":
				default:
					output = formatSearchTable(response.results);
					this.process.stdout.write(
						chalk.dim(
							`\nFound ${response.meta.total} results (mode: ${response.meta.mode})\n\n`
						)
					);
					break;
			}

			this.process.stdout.write(`${output}\n`);
		} catch (error) {
			this.process.stderr.write(
				chalk.red(
					`✗ Search failed: ${error instanceof Error ? error.message : "Unknown error"}\n`
				)
			);
			process.exit(1);
		}
	},
	parameters: {
		flags: {
			type: {
				kind: "parsed",
				parse: String,
				brief: "Filter by type (comma-separated: highlight,bookmark,comment)",
				optional: true,
			},
			tag: {
				kind: "parsed",
				parse: String,
				brief: "Filter by tag name",
				optional: true,
			},
			url: {
				kind: "parsed",
				parse: String,
				brief: "Filter by URL pattern (use * for wildcards)",
				optional: true,
			},
			domain: {
				kind: "parsed",
				parse: String,
				brief: "Filter by domain (e.g., arxiv.org)",
				optional: true,
			},
			after: {
				kind: "parsed",
				parse: String,
				brief: "Created after date (ISO 8601)",
				optional: true,
			},
			before: {
				kind: "parsed",
				parse: String,
				brief: "Created before date (ISO 8601)",
				optional: true,
			},
			limit: {
				kind: "parsed",
				parse: numberParser,
				brief: "Maximum results (default: 20)",
				optional: true,
			},
			format: {
				kind: "parsed",
				parse: String,
				brief: "Output format (json, table, csv, markdown)",
				optional: true,
			},
			sortBy: {
				kind: "parsed",
				parse: String,
				brief: "Sort order (relevance, created)",
				optional: true,
			},
			mode: {
				kind: "parsed",
				parse: String,
				brief: "Search mode (hybrid, fts, semantic)",
				optional: true,
			},
		},
		aliases: {
			t: "type",
			l: "limit",
			f: "format",
		},
		positional: {
			kind: "tuple",
			parameters: [
				{
					brief: "Search query",
					parse: String,
					placeholder: "query",
				},
			],
		},
	},
	docs: {
		brief: "Search highlights, bookmarks, and comments",
		fullDescription:
			"Search across all your content using hybrid full-text and semantic search. Supports filtering by type, tag, URL, domain, and date range.",
		customUsage: [
			'"machine learning"',
			'"react hooks" --type highlight --format json',
			'"arxiv papers" --domain arxiv.org --after 2024-01-01',
		],
	},
});
