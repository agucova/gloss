/**
 * Selection popover for creating highlights.
 * Shows when user selects text on a page.
 *
 * The selector/text are captured eagerly by content.ts before showing
 * this component, to prevent race conditions with dynamic page scripts.
 */

import { type AnnotationSelector, describe } from "@gloss/anchoring";
import { LitElement, css, html, nothing } from "lit";

import {
	GlossElement,
	glossBaseStyles,
	glossButtonStyles,
} from "./gloss-element";

/**
 * Saved selection state — captured eagerly before the popover renders
 * to prevent race conditions with dynamic page content.
 */
let savedSelector: AnnotationSelector | null = null;
let savedText: string | null = null;

/** Capture the current selection immediately (call before showing popover). */
export function captureSelection(): boolean {
	const selection = window.getSelection();
	if (selection && selection.rangeCount > 0) {
		const range = selection.getRangeAt(0);
		try {
			savedSelector = describe(range, { root: document.body });
			savedText = range.toString();
			return true;
		} catch (error) {
			console.error("[Gloss] Failed to describe selection:", error);
		}
	}
	savedSelector = null;
	savedText = null;
	return false;
}

export function getSavedSelector(): AnnotationSelector | null {
	return savedSelector;
}

export function getSavedText(): string | null {
	return savedText;
}

export function clearSavedSelection(): void {
	savedSelector = null;
	savedText = null;
}

export class GlossSelectionPopover extends GlossElement {
	static properties = {
		isAuthenticated: { type: Boolean },
		visible: { type: Boolean, reflect: true },
	};

	static styles = [
		glossBaseStyles,
		glossButtonStyles,
		css`
			:host {
				position: fixed;
				z-index: 2147483647;
				pointer-events: none;
			}

			:host([visible]) {
				pointer-events: auto;
			}

			.popover {
				background: #ffffff;
				border: 1px solid rgba(0, 0, 0, 0.08);
				border-radius: 20px;
				box-shadow:
					0 4px 16px rgba(0, 0, 0, 0.12),
					0 1px 3px rgba(0, 0, 0, 0.08);
				padding: 4px;
				animation: fade-in 0.15s ease-out;
			}

			@media (prefers-color-scheme: dark) {
				.popover {
					background: #2a2a2a;
					border-color: rgba(255, 255, 255, 0.1);
					box-shadow:
						0 4px 16px rgba(0, 0, 0, 0.4),
						0 1px 3px rgba(0, 0, 0, 0.2);
				}
			}

			@keyframes fade-in {
				from {
					opacity: 0;
					transform: translateY(4px);
				}
				to {
					opacity: 1;
					transform: translateY(0);
				}
			}

			.icon-btn {
				display: flex;
				align-items: center;
				justify-content: center;
				width: 32px;
				height: 32px;
				padding: 0;
				border: none;
				border-radius: 50%;
				background: #fef3c7;
				color: #92400e;
				cursor: pointer;
				transition:
					transform 0.1s ease,
					background-color 0.15s ease;
			}
			.icon-btn:hover {
				background: #fde68a;
				transform: scale(1.1);
			}
			.icon-btn:active {
				transform: scale(0.95);
			}

			@media (prefers-color-scheme: dark) {
				.icon-btn {
					background: #78350f;
					color: #fef3c7;
				}
				.icon-btn:hover {
					background: #92400e;
				}
			}

			.signin-prompt {
				text-align: center;
				padding: 4px 8px;
			}
			.signin-prompt p {
				margin-bottom: 8px;
				color: #666666;
				font-size: 12px;
			}
			@media (prefers-color-scheme: dark) {
				.signin-prompt p {
					color: #999999;
				}
			}
		`,
	];

	declare isAuthenticated: boolean;
	declare visible: boolean;

	constructor() {
		super();
		this.isAuthenticated = true;
		this.visible = false;
	}

	/** Position the popover near a selection rect. */
	positionNear(rect: DOMRect): void {
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const offset = 4;

		// Prefer above-right of selection end
		let top = rect.top - 40 - offset;
		let left = rect.right + offset;

		// Flip below if not enough space above
		if (top < 8) {
			top = rect.bottom + offset;
		}

		// Constrain to viewport
		left = Math.max(8, Math.min(left, viewportWidth - 48));
		top = Math.max(8, Math.min(top, viewportHeight - 48));

		this.style.top = `${top}px`;
		this.style.left = `${left}px`;
	}

	show(rect: DOMRect): void {
		this.positionNear(rect);
		this.visible = true;
		this.setupDismissHandlers(() => this.hide());
	}

	hide(): void {
		this.visible = false;
		this._dismissCleanup?.();
		this._dismissCleanup = null;
	}

	render() {
		if (!this.visible) return nothing;

		if (this.isAuthenticated) {
			return html`
				<div class="popover">
					<button
						class="icon-btn"
						aria-label="Create highlight"
						@click=${this._onHighlight}
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="m9 11-6 6v3h9l3-3" />
							<path
								d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"
							/>
						</svg>
					</button>
				</div>
			`;
		}

		return html`
			<div class="popover">
				<div class="signin-prompt">
					<p>Sign in to save highlights</p>
					<button
						class="gloss-btn gloss-btn-primary"
						aria-label="Sign in to Gloss"
						@click=${this._onSignIn}
					>
						Sign in
					</button>
				</div>
			</div>
		`;
	}

	private _onHighlight(e: Event): void {
		e.preventDefault();
		e.stopPropagation();
		this.dispatchEvent(
			new CustomEvent("gloss-highlight", {
				bubbles: true,
				composed: true,
			})
		);
		this.hide();
	}

	private _onSignIn(e: Event): void {
		e.preventDefault();
		e.stopPropagation();
		this.dispatchEvent(
			new CustomEvent("gloss-sign-in", {
				bubbles: true,
				composed: true,
			})
		);
		this.hide();
	}
}

if (!window.customElements.get("gloss-selection-popover")) {
	window.customElements.define("gloss-selection-popover", GlossSelectionPopover);
}
