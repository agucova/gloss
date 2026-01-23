import * as crypto from "node:crypto";
import * as http from "node:http";
import { getApiUrl, setApiKey } from "./config.js";

/**
 * Generate a cryptographically secure random string.
 */
function generateRandomString(length: number): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const randomBytes = crypto.randomBytes(length);
	return Array.from(randomBytes)
		.map((b) => chars[b % chars.length])
		.join("");
}

/**
 * Generate PKCE code_verifier and code_challenge.
 */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
	const codeVerifier = generateRandomString(64);
	const hash = crypto.createHash("sha256").update(codeVerifier).digest();
	const codeChallenge = hash
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
	return { codeVerifier, codeChallenge };
}

/**
 * Find an available port for the callback server.
 */
async function findAvailablePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = http.createServer();
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") {
				const port = address.port;
				server.close(() => resolve(port));
			} else {
				reject(new Error("Failed to find available port"));
			}
		});
		server.on("error", reject);
	});
}

/**
 * Result of the OAuth flow.
 */
export interface OAuthResult {
	apiKey: string;
	keyId: string;
	scope: string;
}

/**
 * Run the OAuth browser flow.
 *
 * 1. Generate PKCE codes
 * 2. Start localhost callback server
 * 3. Open browser to authorize URL
 * 4. Wait for callback with auth code
 * 5. Exchange code for API key
 */
export async function runOAuthFlow(): Promise<OAuthResult> {
	const { codeVerifier, codeChallenge } = generatePKCE();
	const state = generateRandomString(16);
	const port = await findAvailablePort();
	const redirectUri = `http://127.0.0.1:${port}/callback`;

	return new Promise<OAuthResult>((resolve, reject) => {
		let resolved = false;
		const timeout = setTimeout(
			() => {
				if (!resolved) {
					server.close();
					reject(new Error("Authentication timed out after 5 minutes"));
				}
			},
			5 * 60 * 1000
		);

		const server = http.createServer(async (req, res) => {
			const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

			if (url.pathname !== "/callback") {
				res.writeHead(404);
				res.end("Not found");
				return;
			}

			const code = url.searchParams.get("code");
			const authId = url.searchParams.get("auth_id");
			const returnedState = url.searchParams.get("state");
			const error = url.searchParams.get("error");

			if (error) {
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(`
					<!DOCTYPE html>
					<html>
						<head><title>Authentication Failed</title></head>
						<body style="font-family: system-ui; text-align: center; padding: 50px;">
							<h1>Authentication Failed</h1>
							<p>Error: ${error}</p>
							<p>You can close this window.</p>
						</body>
					</html>
				`);
				resolved = true;
				clearTimeout(timeout);
				server.close();
				reject(new Error(`Authentication failed: ${error}`));
				return;
			}

			if (!code || !authId) {
				res.writeHead(400, { "Content-Type": "text/html" });
				res.end(`
					<!DOCTYPE html>
					<html>
						<head><title>Authentication Failed</title></head>
						<body style="font-family: system-ui; text-align: center; padding: 50px;">
							<h1>Authentication Failed</h1>
							<p>Missing authorization code. Please try again.</p>
							<p>You can close this window.</p>
						</body>
					</html>
				`);
				resolved = true;
				clearTimeout(timeout);
				server.close();
				reject(new Error("Missing authorization code"));
				return;
			}

			if (returnedState && returnedState !== state) {
				res.writeHead(400, { "Content-Type": "text/html" });
				res.end(`
					<!DOCTYPE html>
					<html>
						<head><title>Authentication Failed</title></head>
						<body style="font-family: system-ui; text-align: center; padding: 50px;">
							<h1>Authentication Failed</h1>
							<p>State mismatch. Please try again.</p>
							<p>You can close this window.</p>
						</body>
					</html>
				`);
				resolved = true;
				clearTimeout(timeout);
				server.close();
				reject(new Error("State mismatch"));
				return;
			}

			try {
				// Exchange code for API key
				const apiUrl = getApiUrl();
				const tokenResponse = await fetch(`${apiUrl}/api/auth/cli/token`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						code,
						code_verifier: codeVerifier,
						auth_id: authId,
					}),
				});

				if (!tokenResponse.ok) {
					const errorBody = (await tokenResponse.json()) as { error?: string };
					throw new Error(errorBody.error || "Token exchange failed");
				}

				const tokenData = (await tokenResponse.json()) as {
					api_key: string;
					key_id: string;
					scope: string;
				};

				// Save the API key
				setApiKey(tokenData.api_key);

				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(`
					<!DOCTYPE html>
					<html>
						<head><title>Authentication Successful</title></head>
						<body style="font-family: system-ui; text-align: center; padding: 50px;">
							<h1>Authentication Successful</h1>
							<p>You are now logged in to Gloss CLI.</p>
							<p>You can close this window and return to your terminal.</p>
						</body>
					</html>
				`);

				resolved = true;
				clearTimeout(timeout);
				server.close();
				resolve({
					apiKey: tokenData.api_key,
					keyId: tokenData.key_id,
					scope: tokenData.scope,
				});
			} catch (err) {
				res.writeHead(500, { "Content-Type": "text/html" });
				res.end(`
					<!DOCTYPE html>
					<html>
						<head><title>Authentication Failed</title></head>
						<body style="font-family: system-ui; text-align: center; padding: 50px;">
							<h1>Authentication Failed</h1>
							<p>${err instanceof Error ? err.message : "Unknown error"}</p>
							<p>You can close this window.</p>
						</body>
					</html>
				`);
				resolved = true;
				clearTimeout(timeout);
				server.close();
				reject(err);
			}
		});

		server.listen(port, "127.0.0.1", async () => {
			// Build the authorization URL
			const apiUrl = getApiUrl();
			const authUrl = new URL(`${apiUrl}/api/auth/cli/authorize`);
			authUrl.searchParams.set("code_challenge", codeChallenge);
			authUrl.searchParams.set("redirect_uri", redirectUri);
			authUrl.searchParams.set("state", state);

			console.log("\nOpening browser for authentication...");
			console.log(
				`If the browser doesn't open, visit: ${authUrl.toString()}\n`
			);

			// Dynamic import for ESM compatibility
			const open = (await import("open")).default;
			await open(authUrl.toString());
		});

		server.on("error", (err) => {
			resolved = true;
			clearTimeout(timeout);
			reject(err);
		});
	});
}
