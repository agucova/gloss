import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
	listBookmarks,
	listHighlights,
	listTags,
	search,
} from "../lib/api-client.js";

interface SearchArgs {
	query: string;
	types?: string;
	tag?: string;
	domain?: string;
	after?: string;
	before?: string;
	limit?: number;
}

interface LimitArgs {
	limit?: number;
}

const tools = [
	{
		name: "search",
		description:
			"Search across highlights, bookmarks, and comments in your Gloss library. Supports filtering by type, tag, domain, and date range.",
		inputSchema: {
			type: "object" as const,
			properties: {
				query: { type: "string", description: "Search query" },
				types: {
					type: "string",
					description:
						"Comma-separated entity types to filter: highlight, bookmark, comment",
				},
				tag: { type: "string", description: "Filter by tag name" },
				domain: {
					type: "string",
					description: "Filter by domain (e.g., arxiv.org)",
				},
				after: {
					type: "string",
					description: "Filter results created after this date (ISO 8601)",
				},
				before: {
					type: "string",
					description: "Filter results created before this date (ISO 8601)",
				},
				limit: {
					type: "number",
					description: "Maximum number of results (default: 20)",
				},
			},
			required: ["query"],
		},
	},
	{
		name: "list_highlights",
		description: "List your highlights in chronological order",
		inputSchema: {
			type: "object" as const,
			properties: {
				limit: {
					type: "number",
					description: "Maximum number of results (default: 20)",
				},
			},
		},
	},
	{
		name: "list_bookmarks",
		description: "List your bookmarks in chronological order",
		inputSchema: {
			type: "object" as const,
			properties: {
				limit: {
					type: "number",
					description: "Maximum number of results (default: 20)",
				},
			},
		},
	},
	{
		name: "list_tags",
		description: "List all tags used for organizing bookmarks",
		inputSchema: {
			type: "object" as const,
			properties: {
				limit: {
					type: "number",
					description: "Maximum number of results (default: 50)",
				},
			},
		},
	},
];

async function handleSearch(args: SearchArgs) {
	const { query, types, tag, domain, after, before, limit } = args;
	const typeList = types?.split(",").map((t) => t.trim());
	const response = await search({
		query,
		types: typeList,
		tagName: tag,
		domain,
		after,
		before,
		limit: limit ?? 20,
	});
	return {
		content: [
			{ type: "text" as const, text: JSON.stringify(response, null, 2) },
		],
	};
}

async function handleListHighlights(args: LimitArgs) {
	const response = await listHighlights({ limit: args.limit });
	return {
		content: [
			{ type: "text" as const, text: JSON.stringify(response, null, 2) },
		],
	};
}

async function handleListBookmarks(args: LimitArgs) {
	const response = await listBookmarks({ limit: args.limit });
	return {
		content: [
			{ type: "text" as const, text: JSON.stringify(response, null, 2) },
		],
	};
}

async function handleListTags(args: LimitArgs) {
	const response = await listTags(args.limit);
	return {
		content: [
			{ type: "text" as const, text: JSON.stringify(response, null, 2) },
		],
	};
}

/**
 * Register all Gloss tools on the MCP server.
 */
export function registerTools(server: Server): void {
	// Handle list tools request
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return { tools };
	});

	// Handle tool calls
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;

		try {
			switch (name) {
				case "search":
					return await handleSearch(args as unknown as SearchArgs);
				case "list_highlights":
					return await handleListHighlights(args as unknown as LimitArgs);
				case "list_bookmarks":
					return await handleListBookmarks(args as unknown as LimitArgs);
				case "list_tags":
					return await handleListTags(args as unknown as LimitArgs);
				default:
					return {
						content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
						isError: true,
					};
			}
		} catch (error) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
					},
				],
				isError: true,
			};
		}
	});
}
