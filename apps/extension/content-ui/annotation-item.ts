/**
 * Individual margin annotation element.
 * Positioned via FloatingController relative to a highlight element.
 * Renders in full, compact, or dots mode depending on available space.
 */

import { LitElement, css, html, nothing } from "lit";

import type { ServerComment } from "../utils/messages";

import { formatRelativeTime } from "./comment-utils";
import { FloatingController, getDefaultPlacement } from "./floating-controller";
import { glossBaseStyles } from "./gloss-element";

export class GlossAnnotationItem extends LitElement {
	static properties = {
		comments: { type: Array },
		anchor: { type: Object },
		highlightId: { type: String },
		mode: { type: String },
	};

	static styles = [
		glossBaseStyles,
		css`
			:host {
				position: fixed;
				pointer-events: auto;
				display: block;
			}

			.annotation {
				cursor: pointer;
				padding: 10px 12px;
				border-radius: 12px;
				background: rgba(255, 255, 255, 0.92);
				backdrop-filter: blur(8px);
				-webkit-backdrop-filter: blur(8px);
				border: 1px solid rgba(0, 0, 0, 0.06);
				box-shadow:
					0 4px 16px rgba(0, 0, 0, 0.08),
					0 1px 3px rgba(0, 0, 0, 0.04);
				transition: all 0.15s ease;
				animation: fade-in 0.2s ease-out;
				font-family:
					"Satoshi",
					system-ui,
					-apple-system,
					sans-serif;
			}
			.annotation:hover {
				background: rgba(255, 255, 255, 0.98);
				border-color: rgba(0, 0, 0, 0.1);
				box-shadow:
					0 4px 16px rgba(0, 0, 0, 0.12),
					0 1px 3px rgba(0, 0, 0, 0.08);
			}

			@media (prefers-color-scheme: dark) {
				.annotation {
					background: rgba(38, 38, 38, 0.92);
					border-color: rgba(255, 255, 255, 0.08);
					box-shadow:
						0 4px 16px rgba(0, 0, 0, 0.3),
						0 1px 3px rgba(0, 0, 0, 0.15);
				}
				.annotation:hover {
					background: rgba(38, 38, 38, 0.98);
					border-color: rgba(255, 255, 255, 0.12);
					box-shadow:
						0 4px 16px rgba(0, 0, 0, 0.4),
						0 1px 3px rgba(0, 0, 0, 0.2);
				}
			}

			@keyframes fade-in {
				from {
					opacity: 0;
					transform: translateX(8px);
				}
				to {
					opacity: 1;
					transform: translateX(0);
				}
			}

			.author {
				font-size: 11px;
				font-weight: 500;
				color: #666666;
				margin-bottom: 2px;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}
			@media (prefers-color-scheme: dark) {
				.author {
					color: #999999;
				}
			}

			.preview {
				font-size: 11px;
				line-height: 1.4;
				color: #888888;
				display: -webkit-box;
				-webkit-line-clamp: 2;
				-webkit-box-orient: vertical;
				overflow: hidden;
			}
			.compact .preview {
				-webkit-line-clamp: 1;
			}
			@media (prefers-color-scheme: dark) {
				.preview {
					color: #777777;
				}
			}

			.more {
				font-size: 10px;
				color: #aaaaaa;
				margin-top: 2px;
			}
			@media (prefers-color-scheme: dark) {
				.more {
					color: #666666;
				}
			}

			/* Pill mode (dots) */
			.pill {
				display: flex;
				align-items: center;
				gap: 4px;
				padding: 6px 10px;
				border: 1px solid rgba(0, 0, 0, 0.1);
				border-radius: 16px;
				background: rgba(255, 255, 255, 0.98);
				backdrop-filter: blur(8px);
				cursor: pointer;
				transition: all 0.15s ease;
				box-shadow:
					0 2px 8px rgba(0, 0, 0, 0.08),
					0 1px 2px rgba(0, 0, 0, 0.04);
				animation: fade-in 0.2s ease-out;
				font-family:
					"Satoshi",
					system-ui,
					-apple-system,
					sans-serif;
			}
			.pill:hover {
				background: #ffffff;
				box-shadow:
					0 4px 12px rgba(0, 0, 0, 0.12),
					0 2px 4px rgba(0, 0, 0, 0.06);
				transform: translateX(-2px);
			}
			@media (prefers-color-scheme: dark) {
				.pill {
					background: rgba(38, 38, 38, 0.98);
					border-color: rgba(255, 255, 255, 0.1);
					box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
				}
				.pill:hover {
					background: #2a2a2a;
					box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
				}
			}

			.pill-icon {
				display: flex;
				align-items: center;
				justify-content: center;
				color: #f59e0b;
			}
			@media (prefers-color-scheme: dark) {
				.pill-icon {
					color: #fbbf24;
				}
			}

			.pill-count {
				font-size: 13px;
				font-weight: 600;
				color: #1a1a1a;
				min-width: 8px;
				text-align: center;
			}
			@media (prefers-color-scheme: dark) {
				.pill-count {
					color: #e5e5e5;
				}
			}
		`,
	];

	declare comments: ServerComment[];
	declare anchor: HTMLElement | null;
	declare highlightId: string;
	declare mode: "full" | "compact" | "dots";

	private _floating: FloatingController | null = null;

	constructor() {
		super();
		this.comments = [];
		this.anchor = null;
		this.highlightId = "";
		this.mode = "full";
	}

	private _ensureFloating(): FloatingController {
		if (!this._floating) {
			this._floating = new FloatingController(this, {
				placement: getDefaultPlacement(),
				offsetDistance: 24,
				viewportPadding: 8,
				enableFlip: true,
				fallbackPlacements: ["left", "bottom"],
			});
		}
		return this._floating;
	}

	firstUpdated(): void {
		if (this.anchor) {
			this._ensureFloating().attach(this.anchor, this);
		}
	}

	updated(changed: Map<string, unknown>): void {
		if (changed.has("anchor") && this.anchor) {
			this._ensureFloating().attach(this.anchor, this);
		}
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		this._floating?.detach();
	}

	render() {
		if (this.comments.length === 0) return nothing;

		if (this.mode === "dots") {
			return this._renderPill();
		}
		return this._renderText();
	}

	private _renderText() {
		const isCompact = this.mode === "compact";
		const sorted = [...this.comments].sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		);
		const first = sorted[0];
		if (!first) return nothing;

		const authorName = first.author.name || "Someone";
		const time = formatRelativeTime(first.createdAt);
		const maxLen = isCompact ? 80 : 150;
		let text = first.content;
		if (text.length > maxLen) text = `${text.slice(0, maxLen)}...`;

		const width = isCompact ? 140 : 240;

		return html`
			<div
				class="annotation ${isCompact ? "compact" : ""}"
				style="width: ${width}px"
				@click=${this._onClick}
			>
				<div class="author">
					${isCompact ? authorName : `${authorName} \u00B7 ${time}`}
				</div>
				<div class="preview">${text}</div>
				${
					this.comments.length > 1
						? html`<div class="more">
							+${this.comments.length - 1} more
						</div>`
						: nothing
				}
			</div>
		`;
	}

	private _renderPill() {
		return html`
			<button
				class="pill"
				title="${this.comments.length} note${this.comments.length > 1 ? "s" : ""}"
				@click=${this._onClick}
			>
				<span class="pill-icon">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
						></path>
					</svg>
				</span>
				<span class="pill-count">${this.comments.length}</span>
			</button>
		`;
	}

	private _onClick(e: Event): void {
		e.preventDefault();
		e.stopPropagation();
		this.dispatchEvent(
			new CustomEvent("gloss-annotation-click", {
				detail: {
					highlightId: this.highlightId,
					element: this.anchor,
				},
				bubbles: true,
				composed: true,
			})
		);
	}
}

if (!window.customElements.get("gloss-annotation-item")) {
	window.customElements.define("gloss-annotation-item", GlossAnnotationItem);
}
