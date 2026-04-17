import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

beforeAll(() => {
	GlobalRegistrator.register({ url: "http://localhost:3001/" });
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

// Using a dynamic import so happy-dom globals are registered before the
// module-under-test captures its module-level state.
let sendToExtension: typeof import("./extension-bridge").sendToExtension;
let pingExtension: typeof import("./extension-bridge").pingExtension;

beforeAll(async () => {
	const mod = await import("./extension-bridge");
	sendToExtension = mod.sendToExtension;
	pingExtension = mod.pingExtension;
});

describe("extension-bridge", () => {
	let sentMessages: Array<{ data: unknown; origin: string }>;
	let originalPostMessage: typeof window.postMessage;

	beforeEach(() => {
		sentMessages = [];
		originalPostMessage = window.postMessage.bind(window);
		window.postMessage = ((data: unknown, origin: string) => {
			sentMessages.push({ data, origin });
		}) as typeof window.postMessage;
	});

	afterEach(() => {
		window.postMessage = originalPostMessage;
	});

	test("sendToExtension posts a gloss-web message with the right shape and requestId", async () => {
		void sendToExtension({ type: "RUN_IMPORT" });
		expect(sentMessages).toHaveLength(1);
		const { data, origin } = sentMessages[0]!;
		expect(origin).toBe("http://localhost:3001");
		expect(data).toMatchObject({
			source: "gloss-web",
			type: "RUN_IMPORT",
		});
		expect(typeof (data as { requestId: string }).requestId).toBe("string");
	});

	test("resolves with the response when a matching gloss-ext message arrives", async () => {
		const promise = sendToExtension({ type: "PING" });
		const sent = sentMessages[0]!;
		const requestId = (sent.data as { requestId: string }).requestId;

		// Simulate the extension's content script posting a response. The
		// listener is attached on `window`, so we dispatch a MessageEvent
		// directly rather than going through `window.postMessage` (which we
		// stubbed above).
		window.dispatchEvent(
			new MessageEvent("message", {
				source: window,
				data: {
					source: "gloss-ext",
					requestId,
					type: "PING",
					result: { ok: true },
				},
			})
		);

		await expect(promise).resolves.toEqual({ ok: true });
	});

	test("mismatched requestId is ignored; the matching one still resolves", async () => {
		const promiseA = sendToExtension({ type: "RUN_IMPORT" });
		const promiseB = sendToExtension({ type: "TOKEN_REVOKED" });

		const idA = (sentMessages[0]!.data as { requestId: string }).requestId;
		const idB = (sentMessages[1]!.data as { requestId: string }).requestId;
		expect(idA).not.toBe(idB);

		// Respond to B first.
		window.dispatchEvent(
			new MessageEvent("message", {
				source: window,
				data: {
					source: "gloss-ext",
					requestId: idB,
					type: "TOKEN_REVOKED",
					result: "bee",
				},
			})
		);
		await expect(promiseB).resolves.toBe("bee");

		// A is still pending; respond now.
		window.dispatchEvent(
			new MessageEvent("message", {
				source: window,
				data: {
					source: "gloss-ext",
					requestId: idA,
					type: "RUN_IMPORT",
					result: "aye",
				},
			})
		);
		await expect(promiseA).resolves.toBe("aye");
	});

	test("non-gloss-ext source messages are ignored (don't resolve pending promises)", async () => {
		const promise = sendToExtension({ type: "PING" }, 200);
		const requestId = (sentMessages[0]!.data as { requestId: string })
			.requestId;

		// Impostor message from a different "source" (e.g., another extension).
		window.dispatchEvent(
			new MessageEvent("message", {
				source: window,
				data: {
					source: "evil-ext",
					requestId,
					result: "pwned",
				},
			})
		);
		// The listener must NOT resolve with the impostor's payload; it should
		// still wait for a real gloss-ext response, and then time out.
		await expect(promise).resolves.toBeNull();
	});

	test("pingExtension returns true when the extension responds, false on timeout", async () => {
		// Responds immediately.
		queueMicrotask(() => {
			const requestId = (sentMessages[0]!.data as { requestId: string })
				.requestId;
			window.dispatchEvent(
				new MessageEvent("message", {
					source: window,
					data: {
						source: "gloss-ext",
						requestId,
						type: "PING",
						result: { ok: true },
					},
				})
			);
		});
		expect(await pingExtension(500)).toBe(true);

		// This one times out (no response).
		expect(await pingExtension(100)).toBe(false);
	});
});
