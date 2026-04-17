import { expect, test } from "@playwright/test";

import { mintTestApiKey, spawnMcp } from "../fixtures/cli";
import { SEED_USERS } from "../fixtures/seed-ids";

// Minimal JSON-RPC 2.0 client speaking over the MCP server's stdio transport.
// Keeps this spec free of an extra @modelcontextprotocol/sdk root dependency.
class StdioRpcClient {
	private nextId = 1;
	private pending = new Map<
		number,
		{ resolve: (r: unknown) => void; reject: (e: Error) => void }
	>();
	private buf = "";

	constructor(
		private readonly proc: import("node:child_process").ChildProcess
	) {
		proc.stdout?.setEncoding("utf-8");
		proc.stdout?.on("data", (chunk: string) => {
			this.buf += chunk;
			let newline: number;
			while ((newline = this.buf.indexOf("\n")) !== -1) {
				const line = this.buf.slice(0, newline).trim();
				this.buf = this.buf.slice(newline + 1);
				if (!line) continue;
				let msg: { id?: number; result?: unknown; error?: { message: string } };
				try {
					msg = JSON.parse(line);
				} catch {
					continue;
				}
				if (typeof msg.id !== "number") continue;
				const pending = this.pending.get(msg.id);
				if (!pending) continue;
				this.pending.delete(msg.id);
				if (msg.error)
					pending.reject(new Error(`RPC error: ${msg.error.message}`));
				else pending.resolve(msg.result);
			}
		});
	}

	async call<T = unknown>(
		method: string,
		params: Record<string, unknown> = {}
	): Promise<T> {
		const id = this.nextId++;
		const body = `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;
		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, {
				resolve: resolve as (r: unknown) => void,
				reject,
			});
			this.proc.stdin?.write(body, (err) => {
				if (err) {
					this.pending.delete(id);
					reject(err);
				}
			});
			setTimeout(() => {
				if (this.pending.has(id)) {
					this.pending.delete(id);
					reject(new Error(`RPC ${method} timed out after 10s`));
				}
			}, 10_000);
		});
	}

	notify(method: string, params: Record<string, unknown> = {}) {
		const body = `${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`;
		this.proc.stdin?.write(body);
	}
}

test.describe("gloss-mcp stdio server", () => {
	test("initialize + tools/list + tools/call flow", async () => {
		const apiKey = mintTestApiKey(SEED_USERS.agucova.email);
		const mcp = spawnMcp({ apiKey });
		const rpc = new StdioRpcClient(mcp.proc);

		const initResult = (await rpc.call("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "gloss-e2e", version: "0.0.0" },
		})) as { capabilities?: { tools?: object } };
		expect(initResult.capabilities?.tools).toBeDefined();
		rpc.notify("notifications/initialized");

		const tools = (await rpc.call("tools/list")) as {
			tools: Array<{ name: string }>;
		};
		const names = tools.tools.map((t) => t.name).sort();
		expect(names).toEqual(
			["list_bookmarks", "list_highlights", "list_tags", "search"].sort()
		);

		const searchResp = (await rpc.call("tools/call", {
			name: "search",
			arguments: { query: "the", limit: 3 },
		})) as {
			content: Array<{ type: string; text: string }>;
			isError?: boolean;
		};
		expect(searchResp.isError).not.toBe(true);
		expect(searchResp.content[0]?.type).toBe("text");
		const parsed = JSON.parse(searchResp.content[0]!.text) as {
			results: Array<unknown>;
			meta: { query: string };
		};
		expect(parsed.meta.query).toBe("the");
		expect(parsed.results).toBeInstanceOf(Array);

		const highlights = (await rpc.call("tools/call", {
			name: "list_highlights",
			arguments: { limit: 3 },
		})) as { content: Array<{ text: string }>; isError?: boolean };
		const hlParsed = JSON.parse(highlights.content[0]!.text) as {
			items: Array<unknown>;
		};
		expect(hlParsed.items.length).toBeLessThanOrEqual(3);

		await mcp.kill();
	});

	test("exits 1 on startup with no API key configured", async () => {
		const mcp = spawnMcp({
			// no apiKey — the fixture deletes GLOSS_API_KEY from the env
			configDir: "/tmp/gloss-mcp-no-key-" + Date.now(),
		});
		const code = await mcp.waitForExit(5_000);
		expect(code).not.toBe(0);
		expect(mcp.stderr()).toMatch(/No API key configured/);
	});
});
