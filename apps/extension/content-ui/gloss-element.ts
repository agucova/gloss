/**
 * Base class and shared styles for all Gloss content script components.
 * Provides dismiss handling mixin and common CSS tokens.
 */

import { LitElement, css } from "lit";

/** Font injection — called once by content.ts to load Satoshi globally */
let fontInjected = false;
export function ensureFontLoaded(): void {
	if (fontInjected) return;
	fontInjected = true;
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href =
		"https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap";
	document.head.appendChild(link);
}

/** Shared reset and typography styles */
export const glossBaseStyles = css`
	:host {
		font-family:
			"Satoshi",
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 13px;
		line-height: 1.4;
		color: #1a1a1a;
		box-sizing: border-box;
	}

	@media (prefers-color-scheme: dark) {
		:host {
			color: #e5e5e5;
		}
	}

	*,
	*::before,
	*::after {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}
`;

/** Shared button styles */
export const glossButtonStyles = css`
	.gloss-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 6px 12px;
		font-size: 12px;
		font-weight: 500;
		font-family: inherit;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			opacity 0.15s ease;
		white-space: nowrap;
	}

	.gloss-btn:focus {
		outline: 2px solid rgba(0, 0, 0, 0.2);
		outline-offset: 1px;
	}

	.gloss-btn-primary {
		background: #1a1a1a;
		color: #ffffff;
	}
	.gloss-btn-primary:hover {
		background: #333333;
	}
	.gloss-btn-primary:disabled {
		background: #999999;
		cursor: not-allowed;
		opacity: 0.6;
	}

	@media (prefers-color-scheme: dark) {
		.gloss-btn-primary {
			background: #e5e5e5;
			color: #1a1a1a;
		}
		.gloss-btn-primary:hover {
			background: #ffffff;
		}
	}

	.gloss-btn-ghost {
		background: transparent;
		color: #666666;
	}
	.gloss-btn-ghost:hover {
		background: rgba(0, 0, 0, 0.05);
		color: #1a1a1a;
	}

	@media (prefers-color-scheme: dark) {
		.gloss-btn-ghost {
			color: #999999;
		}
		.gloss-btn-ghost:hover {
			background: rgba(255, 255, 255, 0.1);
			color: #e5e5e5;
		}
	}
`;

/**
 * Base class for Gloss components that need dismiss-on-click-outside behavior.
 * Provides setupDismissHandlers() with automatic cleanup on disconnect.
 */
export class GlossElement extends LitElement {
	protected _dismissCleanup: (() => void) | null = null;

	/**
	 * Set up handlers that dismiss the component on click outside,
	 * Escape key, or scroll (unless mouse/focus is inside).
	 */
	protected setupDismissHandlers(onDismiss: () => void): void {
		// Clean up any existing handlers first
		this._dismissCleanup?.();

		let clickListenerActive = false;
		let isMouseInside = false;
		let hasFocusInside = false;

		const handleMouseEnter = () => {
			isMouseInside = true;
		};
		const handleMouseLeave = () => {
			isMouseInside = false;
		};
		const handleFocusIn = () => {
			hasFocusInside = true;
		};
		const handleFocusOut = () => {
			hasFocusInside = false;
		};

		const handleClickOutside = (e: MouseEvent) => {
			if (!clickListenerActive) return;
			const path = e.composedPath();
			if (!path.includes(this)) {
				onDismiss();
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onDismiss();
		};

		const handleScroll = () => {
			if (!clickListenerActive || isMouseInside || hasFocusInside) return;
			onDismiss();
		};

		this.addEventListener("mouseenter", handleMouseEnter);
		this.addEventListener("mouseleave", handleMouseLeave);
		this.addEventListener("focusin", handleFocusIn);
		this.addEventListener("focusout", handleFocusOut);
		document.addEventListener("click", handleClickOutside, true);
		document.addEventListener("keydown", handleKeyDown);
		window.addEventListener("scroll", handleScroll, true);

		// Delay activation to prevent race with the click/selection that triggered opening
		setTimeout(() => {
			clickListenerActive = true;
		}, 100);

		this._dismissCleanup = () => {
			this.removeEventListener("mouseenter", handleMouseEnter);
			this.removeEventListener("mouseleave", handleMouseLeave);
			this.removeEventListener("focusin", handleFocusIn);
			this.removeEventListener("focusout", handleFocusOut);
			document.removeEventListener("click", handleClickOutside, true);
			document.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("scroll", handleScroll, true);
		};
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		this._dismissCleanup?.();
		this._dismissCleanup = null;
	}
}

/**
 * Generate a unique ID for highlights.
 */
export function generateId(): string {
	return `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
