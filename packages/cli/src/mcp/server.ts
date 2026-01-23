import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getApiKey } from "../lib/config.js";
import { registerTools } from "./tools.js";

/**
 * Start the Gloss MCP server.
 */
export async function startServer(): Promise<void> {
	// Check for API key
	const apiKey = getApiKey();
	if (!apiKey) {
		console.error(
			"Error: No API key configured. Run 'gloss auth login' or set GLOSS_API_KEY environment variable."
		);
		process.exit(1);
	}

	// Create the MCP server
	const server = new Server(
		{
			name: "gloss",
			version: "0.0.1",
		},
		{
			capabilities: {
				tools: {},
			},
		}
	);

	// Register all tools
	registerTools(server);

	// Connect via stdio transport
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
