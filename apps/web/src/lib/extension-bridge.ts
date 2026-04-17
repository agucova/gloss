/**
 * Thin web-side bridge for talking to the Gloss browser extension.
 *
 * The extension's content script runs on the web app's pages (matches
 * `<all_urls>`) and listens for `{source: "gloss-web"}` messages on
 * `window`, relaying them to the background service worker. That gives the
 * web settings page a way to kick off an import or signal a disconnect
 * without needing the extension's ID (which would force either hardcoding
 * per environment or exposing it through the content script at runtime).
 */

type Request =
	| { type: "PING" }
	| { type: "RUN_IMPORT" }
	| { type: "TOKEN_REVOKED" }
	| { type: "START_CONNECT" };

export type StartConnectResult =
	| {
			started: true;
			mode: "already-connected" | "reading" | "opened-tab";
	  }
	| { error: string };

interface PendingResolver {
	resolve: (value: unknown) => void;
	timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingResolver>();
let listenerInstalled = false;

function installListener() {
	if (listenerInstalled || typeof window === "undefined") return;
	listenerInstalled = true;
	window.addEventListener("message", (event) => {
		if (event.source !== window) return;
		const data = event.data as {
			source?: unknown;
			requestId?: string;
			result?: unknown;
		} | null;
		if (!data || data.source !== "gloss-ext") return;
		const id = typeof data.requestId === "string" ? data.requestId : undefined;
		if (!id) return;
		const resolver = pending.get(id);
		if (!resolver) return;
		clearTimeout(resolver.timer);
		pending.delete(id);
		resolver.resolve(data.result ?? null);
	});
}

/**
 * Post a message to the extension. Resolves with the extension's response,
 * or `null` if no response arrived within `timeoutMs` (extension not
 * installed, service worker cold-booting too slowly, etc.).
 */
export function sendToExtension(
	message: Request,
	timeoutMs = 3000
): Promise<unknown | null> {
	if (typeof window === "undefined") return Promise.resolve(null);
	installListener();
	return new Promise((resolve) => {
		const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const timer = setTimeout(() => {
			if (pending.delete(requestId)) resolve(null);
		}, timeoutMs);
		pending.set(requestId, { resolve, timer });
		window.postMessage(
			{ source: "gloss-web", type: message.type, requestId },
			window.location.origin
		);
	});
}

/**
 * Ping the extension to check whether it's installed and responsive. A
 * little slower than a pure "did content script inject a marker" probe but
 * more reliable because MV3 service workers can cold-boot on demand.
 */
export async function pingExtension(timeoutMs = 3000): Promise<boolean> {
	const result = await sendToExtension({ type: "PING" }, timeoutMs);
	return result !== null;
}
