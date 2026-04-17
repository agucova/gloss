/**
 * E2E fixtures for the Gloss CLI + MCP subprocesses.
 *
 * Provides:
 * - spawnCli / spawnMcp — child_process helpers with env + line-buffered I/O
 * - createTmpConfigDir / readConfigFrom — XDG-isolated config per test
 * - mintTestApiKey — shells out to `convex run cliAuth:_devMintApiKey`
 *   against the dev/preview deployment (requires ALLOW_DEV_MINT=true set on
 *   the backend). Cheapest way to get a real, valid API key without driving
 *   the full PKCE browser flow.
 */

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const thisDir = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(thisDir, "..", "..");
export const CLI_PATH = join(REPO_ROOT, "packages", "cli", "dist", "cli.js");
export const MCP_PATH = join(REPO_ROOT, "packages", "cli", "dist", "mcp.js");

export const CONVEX_SITE_URL =
	process.env.VITE_CONVEX_SITE_URL ?? "https://glorious-toad-644.convex.site";

export interface CliHandle {
	proc: ChildProcess;
	/** All stdout chunks captured since spawn (joined). */
	stdout(): string;
	/** All stderr chunks captured since spawn (joined). */
	stderr(): string;
	/**
	 * Resolves with the first stdout line matching `pattern`. Rejects after
	 * `timeoutMs`. If the line has already been seen, resolves immediately.
	 */
	waitForStdout(pattern: RegExp, timeoutMs?: number): Promise<RegExpMatchArray>;
	/** Resolves with the process exit code (or signal code 128+sig). */
	waitForExit(timeoutMs?: number): Promise<number>;
	/** Send SIGTERM and wait for exit. */
	kill(): Promise<void>;
}

function attachStreamBuffer(stream: Readable, buf: { chunks: string[] }) {
	stream.setEncoding("utf-8");
	stream.on("data", (chunk: string) => {
		buf.chunks.push(chunk);
	});
}

function wrapProcess(proc: ChildProcess): CliHandle {
	const outBuf = { chunks: [] as string[] };
	const errBuf = { chunks: [] as string[] };
	if (proc.stdout) attachStreamBuffer(proc.stdout, outBuf);
	if (proc.stderr) attachStreamBuffer(proc.stderr, errBuf);

	let exited: { code: number } | null = null;
	const exitWaiters: Array<(code: number) => void> = [];
	proc.on("exit", (code, signal) => {
		const resolved = code ?? (signal ? 128 : 0);
		exited = { code: resolved };
		for (const fn of exitWaiters) fn(resolved);
	});

	return {
		proc,
		stdout: () => outBuf.chunks.join(""),
		stderr: () => errBuf.chunks.join(""),
		async waitForStdout(pattern, timeoutMs = 30_000) {
			const start = Date.now();
			const check = () => outBuf.chunks.join("").match(pattern);
			const first = check();
			if (first) return first;
			return await new Promise<RegExpMatchArray>((resolveFn, rejectFn) => {
				const onData = () => {
					const m = check();
					if (m) {
						cleanup();
						resolveFn(m);
					} else if (Date.now() - start > timeoutMs) {
						cleanup();
						rejectFn(
							new Error(
								`waitForStdout(${pattern}) timed out after ${timeoutMs}ms\n` +
									`stdout: ${outBuf.chunks.join("")}\n` +
									`stderr: ${errBuf.chunks.join("")}`
							)
						);
					}
				};
				const onExit = () => {
					cleanup();
					rejectFn(
						new Error(
							`Process exited before stdout matched ${pattern}\n` +
								`stdout: ${outBuf.chunks.join("")}\n` +
								`stderr: ${errBuf.chunks.join("")}`
						)
					);
				};
				const cleanup = () => {
					proc.stdout?.off("data", onData);
					proc.off("exit", onExit);
				};
				proc.stdout?.on("data", onData);
				proc.on("exit", onExit);
			});
		},
		async waitForExit(timeoutMs = 30_000) {
			if (exited) return exited.code;
			return await new Promise<number>((resolveFn, rejectFn) => {
				const timer = setTimeout(() => {
					rejectFn(
						new Error(
							`Process did not exit within ${timeoutMs}ms\n` +
								`stdout: ${outBuf.chunks.join("")}\n` +
								`stderr: ${errBuf.chunks.join("")}`
						)
					);
				}, timeoutMs);
				exitWaiters.push((code) => {
					clearTimeout(timer);
					resolveFn(code);
				});
			});
		},
		async kill() {
			if (exited) return;
			proc.kill("SIGTERM");
			await new Promise<void>((resolveFn) => {
				if (exited) {
					resolveFn();
					return;
				}
				exitWaiters.push(() => resolveFn());
			});
		},
	};
}

export interface SpawnOpts {
	apiKey?: string;
	apiUrl?: string;
	configDir?: string;
	extraEnv?: Record<string, string>;
}

function buildEnv(opts: SpawnOpts): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env, ...opts.extraEnv };
	if (opts.apiKey) env.GLOSS_API_KEY = opts.apiKey;
	else delete env.GLOSS_API_KEY;
	env.GLOSS_API_URL = opts.apiUrl ?? CONVEX_SITE_URL;
	if (opts.configDir) env.XDG_CONFIG_HOME = opts.configDir;
	return env;
}

export function spawnCli(args: string[], opts: SpawnOpts = {}): CliHandle {
	const proc = spawn("node", [CLI_PATH, ...args], {
		env: buildEnv(opts),
		stdio: ["pipe", "pipe", "pipe"],
	});
	return wrapProcess(proc);
}

export function spawnMcp(opts: SpawnOpts = {}): CliHandle {
	const proc = spawn("node", [MCP_PATH], {
		env: buildEnv(opts),
		stdio: ["pipe", "pipe", "pipe"],
	});
	return wrapProcess(proc);
}

export function createTmpConfigDir(): string {
	return mkdtempSync(join(tmpdir(), "gloss-cli-e2e-"));
}

export function readConfigFrom(configDir: string): {
	apiKey?: string;
	apiUrl?: string;
	defaultFormat?: string;
} {
	try {
		const raw = readFileSync(join(configDir, "gloss", "config.json"), "utf-8");
		return JSON.parse(raw) as { apiKey?: string };
	} catch {
		return {};
	}
}

/**
 * Mint a real API key for a seed user via the dev-gated internal mutation.
 *
 * Requires:
 * - `bunx convex dev` running locally, OR a CI preview deployed
 * - `ALLOW_DEV_MINT=true` set on the target Convex deployment
 *
 * In CI, set `CONVEX_PREVIEW_NAME` so the mutation is routed to the preview
 * rather than an implicit default.
 */
export function mintTestApiKey(email: string): string {
	const previewArgs = process.env.CONVEX_PREVIEW_NAME
		? ["--preview-name", process.env.CONVEX_PREVIEW_NAME]
		: [];
	const output = execFileSync(
		"bunx",
		[
			"convex",
			"run",
			...previewArgs,
			"cliAuth:_devMintApiKey",
			JSON.stringify({ email }),
		],
		{ cwd: REPO_ROOT, encoding: "utf-8" }
	);
	// `convex run` prints the function's JSON-stringified return value on
	// stdout, possibly preceded by log lines. Find the last JSON object.
	const match = output.match(/\{[\s\S]*\}\s*$/);
	if (!match) {
		throw new Error(`Could not parse convex run output: ${output}`);
	}
	const parsed = JSON.parse(match[0]) as { apiKey?: string };
	if (!parsed.apiKey) {
		throw new Error(`Mint returned no apiKey: ${output}`);
	}
	return parsed.apiKey;
}
