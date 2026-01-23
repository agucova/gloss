import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * CLI configuration stored in ~/.config/gloss/config.json
 */
export interface GlossConfig {
	apiKey?: string;
	apiUrl: string;
	defaultFormat: "json" | "table" | "csv" | "markdown";
}

const DEFAULT_CONFIG: GlossConfig = {
	apiUrl: "https://api.gloss.agus.sh",
	defaultFormat: "table",
};

/**
 * Get the config directory path.
 */
export function getConfigDir(): string {
	const configHome =
		process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
	return path.join(configHome, "gloss");
}

/**
 * Get the config file path.
 */
export function getConfigPath(): string {
	return path.join(getConfigDir(), "config.json");
}

/**
 * Ensure the config directory exists.
 */
function ensureConfigDir(): void {
	const dir = getConfigDir();
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
}

/**
 * Load the CLI configuration.
 */
export function loadConfig(): GlossConfig {
	const configPath = getConfigPath();
	if (!fs.existsSync(configPath)) {
		return { ...DEFAULT_CONFIG };
	}

	try {
		const content = fs.readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(content) as Partial<GlossConfig>;
		return {
			...DEFAULT_CONFIG,
			...parsed,
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

/**
 * Save the CLI configuration.
 */
export function saveConfig(config: GlossConfig): void {
	ensureConfigDir();
	const configPath = getConfigPath();
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
		mode: 0o600,
	});
}

/**
 * Get the API key from config or environment.
 */
export function getApiKey(): string | undefined {
	return process.env.GLOSS_API_KEY || loadConfig().apiKey;
}

/**
 * Get the API URL from config or environment.
 */
export function getApiUrl(): string {
	return process.env.GLOSS_API_URL || loadConfig().apiUrl;
}

/**
 * Set the API key in config.
 */
export function setApiKey(apiKey: string): void {
	const config = loadConfig();
	config.apiKey = apiKey;
	saveConfig(config);
}

/**
 * Clear the API key from config.
 */
export function clearApiKey(): void {
	const config = loadConfig();
	delete config.apiKey;
	saveConfig(config);
}
