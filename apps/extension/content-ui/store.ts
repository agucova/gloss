/**
 * Minimal reactive store for content script state.
 * Components subscribe to Signals via SignalWatcher controllers,
 * and automatically re-render when values change.
 */

import type { HighlightManager } from "@gloss/anchoring";
import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { PageCommentSummary, UserSettings } from "../utils/messages";

/**
 * A minimal observable value that notifies subscribers on change.
 */
export class Signal<T> {
	private _value: T;
	private _subscribers = new Set<() => void>();

	constructor(initial: T) {
		this._value = initial;
	}

	get value(): T {
		return this._value;
	}

	set value(next: T) {
		this._value = next;
		for (const fn of this._subscribers) fn();
	}

	subscribe(fn: () => void): () => void {
		this._subscribers.add(fn);
		return () => this._subscribers.delete(fn);
	}
}

/**
 * Lit ReactiveController that bridges a Signal to a component's render cycle.
 * When the signal changes, the host component re-renders.
 */
export class SignalWatcher<T> implements ReactiveController {
	private _unsubscribe: (() => void) | null = null;

	constructor(
		private host: ReactiveControllerHost,
		private signal: Signal<T>
	) {
		this.host.addController(this);
	}

	get value(): T {
		return this.signal.value;
	}

	hostConnected(): void {
		this._unsubscribe = this.signal.subscribe(() => {
			this.host.requestUpdate();
		});
	}

	hostDisconnected(): void {
		this._unsubscribe?.();
		this._unsubscribe = null;
	}
}

/**
 * Global content script state. Written by content.ts, read by Lit components.
 */
export const glossState = {
	isAuthenticated: new Signal(false),
	currentUserId: new Signal<string | null>(null),
	userSettings: new Signal<UserSettings | null>(null),
	commentSummary: new Signal<PageCommentSummary | null>(null),
	annotationsVisible: new Signal(false),
	highlightCommentCounts: new Signal(new Map<string, number>()),
	manager: new Signal<HighlightManager | null>(null),
};
