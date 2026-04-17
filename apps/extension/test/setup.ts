/**
 * Shared test setup for extension unit tests. Stubs `globalThis.browser`
 * with an in-memory chrome.storage-like shape and provides helpers for
 * advancing a faked wall clock.
 *
 * We don't import `webextension-polyfill` in tests — the surface we actually
 * use is `browser.storage.sync.{get,set,remove}` and
 * `browser.storage.local.{get,set,remove}`, which are trivial to mock with
 * real fidelity (storage returns objects keyed by the requested key, throws
 * nothing on missing keys).
 */

type StorageArea = {
	get: (keys: string | string[]) => Promise<Record<string, unknown>>;
	set: (items: Record<string, unknown>) => Promise<void>;
	remove: (keys: string | string[]) => Promise<void>;
	clear: () => Promise<void>;
	_data: Map<string, unknown>;
};

function makeStorageArea(): StorageArea {
	const data = new Map<string, unknown>();
	return {
		_data: data,
		get: async (keys) => {
			const keyList = typeof keys === "string" ? [keys] : keys;
			const result: Record<string, unknown> = {};
			for (const k of keyList) {
				if (data.has(k)) result[k] = data.get(k);
			}
			return result;
		},
		set: async (items) => {
			for (const [k, v] of Object.entries(items)) data.set(k, v);
		},
		remove: async (keys) => {
			const keyList = typeof keys === "string" ? [keys] : keys;
			for (const k of keyList) data.delete(k);
		},
		clear: async () => {
			data.clear();
		},
	};
}

export interface ExtensionTestEnv {
	sync: StorageArea;
	local: StorageArea;
	reset: () => void;
}

/**
 * Install a fresh `globalThis.browser` with empty storage areas. Call from
 * `beforeEach` to isolate tests. Returns the storage handles so tests can
 * seed state directly (rather than going through the module-under-test).
 */
export function installBrowserStub(): ExtensionTestEnv {
	const sync = makeStorageArea();
	const local = makeStorageArea();
	const browserStub = { storage: { sync, local } };
	// WXT and webextension-polyfill both expose the `browser` global; modules
	// under test assume it exists.
	(globalThis as unknown as { browser: typeof browserStub }).browser =
		browserStub;
	return {
		sync,
		local,
		reset: () => {
			sync._data.clear();
			local._data.clear();
		},
	};
}

/**
 * Clock helper that lets tests advance time deterministically without
 * touching `Date.now`. Any module that caches against `Date.now()` needs
 * to accept an injectable clock or be re-imported between windows — plain
 * mocks don't let us rewind millis within bun's test runner, so instead we
 * expose an explicit advance helper that tests can compose.
 *
 * Returns `{now, advance}`. `now()` reports the current fake time;
 * `advance(ms)` bumps it. Tests pass `now` into the module when needed.
 */
export function createFakeClock(initial = 1_700_000_000_000): {
	now: () => number;
	advance: (ms: number) => void;
} {
	let current = initial;
	return {
		now: () => current,
		advance: (ms) => {
			current += ms;
		},
	};
}
