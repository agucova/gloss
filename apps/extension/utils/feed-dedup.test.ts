import { describe, expect, it, mock } from "bun:test";

import { FeedDedup, type HighlightRemover } from "./feed-dedup";

function makeManager(): HighlightRemover & {
	remove: ReturnType<typeof mock>;
	removed: string[];
} {
	const removed: string[] = [];
	const remove = mock((id: string) => {
		removed.push(id);
		return true;
	});
	return { remove, removed } as HighlightRemover & {
		remove: ReturnType<typeof mock>;
		removed: string[];
	};
}

describe("FeedDedup", () => {
	it("bridge-first, native-second: the bridge copy is removed and native wins", () => {
		const dedup = new FeedDedup();
		const manager = makeManager();

		// Bridge arrives first — renders.
		const shouldRender = dedup.shouldRenderBridge("ext-1", "curius:ext-1");
		expect(shouldRender).toBe(true);

		// Native arrives for the same externalId — evicts bridge.
		dedup.onNativeHighlight("ext-1", manager);
		expect(manager.removed).toEqual(["curius:ext-1"]);

		// A subsequent bridge arrival for the same externalId is now skipped.
		const shouldRenderAgain = dedup.shouldRenderBridge("ext-1", "curius:ext-1");
		expect(shouldRenderAgain).toBe(false);
	});

	it("native-first, bridge-second: the bridge is skipped; manager.remove is not called", () => {
		const dedup = new FeedDedup();
		const manager = makeManager();

		dedup.onNativeHighlight("ext-2", manager);
		expect(manager.remove).toHaveBeenCalledTimes(0);

		const shouldRender = dedup.shouldRenderBridge("ext-2", "curius:ext-2");
		expect(shouldRender).toBe(false);
		expect(manager.remove).toHaveBeenCalledTimes(0);
	});

	it("different externalIds don't interfere", () => {
		const dedup = new FeedDedup();
		const manager = makeManager();

		expect(dedup.shouldRenderBridge("a", "curius:a")).toBe(true);
		expect(dedup.shouldRenderBridge("b", "curius:b")).toBe(true);

		dedup.onNativeHighlight("a", manager);
		expect(manager.removed).toEqual(["curius:a"]);
		// b is untouched.
		expect(dedup.shouldRenderBridge("b", "curius:b-other")).toBe(true);
	});

	it("undefined externalId on native is a no-op, not a crash", () => {
		const dedup = new FeedDedup();
		const manager = makeManager();

		expect(() => dedup.onNativeHighlight(undefined, manager)).not.toThrow();
		expect(manager.remove).toHaveBeenCalledTimes(0);

		// A bridge highlight with externalId still participates normally.
		expect(dedup.shouldRenderBridge("fresh", "curius:fresh")).toBe(true);
	});

	it("onNativeHighlight called twice for the same externalId does not double-remove", () => {
		const dedup = new FeedDedup();
		const manager = makeManager();

		dedup.shouldRenderBridge("dup", "curius:dup");
		dedup.onNativeHighlight("dup", manager);
		dedup.onNativeHighlight("dup", manager);

		expect(manager.removed).toEqual(["curius:dup"]);
	});

	it("reset() clears both sides so a fresh nav starts clean", () => {
		const dedup = new FeedDedup();
		const manager = makeManager();

		// Seed some state.
		dedup.shouldRenderBridge("x", "curius:x");
		dedup.onNativeHighlight("y", manager);

		dedup.reset();

		// After reset, a native arrival for an externalId seen pre-reset
		// should NOT try to evict a bridge copy (because reset dropped that
		// tracker). And a bridge arrival for a previously-native externalId
		// should now render.
		const nextManager = makeManager();
		dedup.onNativeHighlight("x", nextManager);
		expect(nextManager.remove).toHaveBeenCalledTimes(0);
		expect(dedup.shouldRenderBridge("y", "curius:y")).toBe(true);
	});
});
