/**
 * DOM mutation observer with debouncing.
 * Watches for DOM changes that might affect highlight positioning.
 */

export type MutationCallback = () => void;

export interface MutationObserverOptions {
	/** Debounce interval in milliseconds (default: 100) */
	debounceMs?: number;
	/** Watch for child node changes (default: true) */
	childList?: boolean;
	/** Watch the entire subtree (default: true) */
	subtree?: boolean;
	/** Watch for text content changes (default: true) */
	characterData?: boolean;
	/** Watch for attribute changes (default: false) */
	attributes?: boolean;
}

const DEFAULT_OPTIONS: Required<MutationObserverOptions> = {
	debounceMs: 100,
	childList: true,
	subtree: true,
	characterData: true,
	attributes: false,
};

/**
 * Observer that watches for DOM mutations with debouncing.
 *
 * Useful for detecting when page content changes and highlights
 * might need to be re-anchored.
 */
export class DomMutationObserver {
	private readonly callback: MutationCallback;
	private readonly root: Element;
	private readonly options: Required<MutationObserverOptions>;
	private observer: MutationObserver | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private isObserving = false;

	constructor(
		root: Element,
		callback: MutationCallback,
		options: MutationObserverOptions = {}
	) {
		this.root = root;
		this.callback = callback;
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	/**
	 * Start observing DOM mutations.
	 */
	start(): void {
		if (this.isObserving) {
			return;
		}
		this.isObserving = true;

		this.observer = new MutationObserver(this.handleMutations.bind(this));
		this.observer.observe(this.root, {
			childList: this.options.childList,
			subtree: this.options.subtree,
			characterData: this.options.characterData,
			attributes: this.options.attributes,
		});
	}

	/**
	 * Stop observing DOM mutations.
	 */
	stop(): void {
		if (!this.isObserving) {
			return;
		}
		this.isObserving = false;

		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
	}

	/**
	 * Check if currently observing.
	 */
	isActive(): boolean {
		return this.isObserving;
	}

	/**
	 * Handle mutation records with debouncing.
	 */
	private handleMutations(mutations: MutationRecord[]): void {
		// Filter out mutations caused by our own highlighting
		const relevantMutations = mutations.filter(
			(mutation) => !this.isHighlightMutation(mutation)
		);

		if (relevantMutations.length === 0) {
			return;
		}

		// Debounce the callback
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			this.callback();
		}, this.options.debounceMs);
	}

	/**
	 * Check if a mutation was caused by highlight operations.
	 */
	private isHighlightMutation(mutation: MutationRecord): boolean {
		// Check if the target or added/removed nodes are highlight elements
		if (mutation.type === "childList") {
			for (const node of mutation.addedNodes) {
				if (this.isHighlightElement(node)) {
					return true;
				}
			}
			for (const node of mutation.removedNodes) {
				if (this.isHighlightElement(node)) {
					return true;
				}
			}
		}

		// Check if target is a highlight element
		if (this.isHighlightElement(mutation.target)) {
			return true;
		}

		// Check if target's parent is a highlight element
		const parent = mutation.target.parentElement;
		if (parent && this.isHighlightElement(parent)) {
			return true;
		}

		return false;
	}

	/**
	 * Check if a node is a highlight element.
	 */
	private isHighlightElement(node: Node): boolean {
		if (node.nodeType !== Node.ELEMENT_NODE) {
			return false;
		}
		const element = node as Element;
		return (
			element.hasAttribute("data-gloss-id") ||
			element.classList.contains("gloss-highlight")
		);
	}
}

/**
 * Simple debounce utility for one-off use.
 */
export function debounce<T extends (...args: unknown[]) => void>(
	fn: T,
	ms: number
): (...args: Parameters<T>) => void {
	let timer: ReturnType<typeof setTimeout> | null = null;

	return (...args: Parameters<T>) => {
		if (timer !== null) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = null;
			fn(...args);
		}, ms);
	};
}
