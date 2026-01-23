/**
 * Navigation observer for SPA support.
 * Detects navigation via History API and Navigation API.
 */

export type NavigationCallback = (url: string) => void;

/**
 * Observer that detects SPA navigation.
 *
 * Uses multiple strategies:
 * 1. Modern Navigation API (Chrome 102+)
 * 2. History API interception (pushState, replaceState)
 * 3. popstate event for back/forward
 */
export class NavigationObserver {
	private readonly callback: NavigationCallback;
	private currentUrl: string;
	private isObserving = false;

	// Store original methods for cleanup
	private originalPushState: typeof history.pushState | null = null;
	private originalReplaceState: typeof history.replaceState | null = null;

	// Bound handlers for removal
	private readonly boundPopstateHandler: () => void;
	private boundNavigationHandler: ((event: Event) => void) | null = null;

	constructor(callback: NavigationCallback) {
		this.callback = callback;
		this.currentUrl = location.href;
		this.boundPopstateHandler = this.handlePopstate.bind(this);
	}

	/**
	 * Start observing navigation events.
	 */
	start(): void {
		if (this.isObserving) {
			return;
		}
		this.isObserving = true;

		// Strategy 1: Modern Navigation API (if available)
		if ("navigation" in window) {
			this.boundNavigationHandler = this.handleNavigationEvent.bind(this);
			(
				window as unknown as { navigation: EventTarget }
			).navigation.addEventListener(
				"navigatesuccess",
				this.boundNavigationHandler
			);
		}

		// Strategy 2: Intercept History API
		this.interceptHistoryMethods();

		// Strategy 3: Listen for popstate (back/forward)
		window.addEventListener("popstate", this.boundPopstateHandler);
	}

	/**
	 * Stop observing and restore original state.
	 */
	stop(): void {
		if (!this.isObserving) {
			return;
		}
		this.isObserving = false;

		// Remove Navigation API listener
		if (this.boundNavigationHandler && "navigation" in window) {
			(
				window as unknown as { navigation: EventTarget }
			).navigation.removeEventListener(
				"navigatesuccess",
				this.boundNavigationHandler
			);
		}

		// Restore History API methods
		this.restoreHistoryMethods();

		// Remove popstate listener
		window.removeEventListener("popstate", this.boundPopstateHandler);
	}

	/**
	 * Get the current URL being tracked.
	 */
	getCurrentUrl(): string {
		return this.currentUrl;
	}

	/**
	 * Intercept history.pushState and history.replaceState.
	 */
	private interceptHistoryMethods(): void {
		this.originalPushState = history.pushState.bind(history);
		this.originalReplaceState = history.replaceState.bind(history);

		history.pushState = (
			data: unknown,
			unused: string,
			url?: string | URL | null
		): void => {
			this.originalPushState?.(data, unused, url);
			this.checkUrlChange();
		};

		history.replaceState = (
			data: unknown,
			unused: string,
			url?: string | URL | null
		): void => {
			this.originalReplaceState?.(data, unused, url);
			this.checkUrlChange();
		};
	}

	/**
	 * Restore original History API methods.
	 */
	private restoreHistoryMethods(): void {
		if (this.originalPushState) {
			history.pushState = this.originalPushState;
			this.originalPushState = null;
		}
		if (this.originalReplaceState) {
			history.replaceState = this.originalReplaceState;
			this.originalReplaceState = null;
		}
	}

	/**
	 * Handle Navigation API events.
	 */
	private handleNavigationEvent(): void {
		this.checkUrlChange();
	}

	/**
	 * Handle popstate events (back/forward navigation).
	 */
	private handlePopstate(): void {
		this.checkUrlChange();
	}

	/**
	 * Check if URL changed and fire callback if so.
	 */
	private checkUrlChange(): void {
		const newUrl = location.href;
		if (newUrl !== this.currentUrl) {
			this.currentUrl = newUrl;
			this.callback(newUrl);
		}
	}
}
