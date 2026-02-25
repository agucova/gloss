/**
 * Floating comment indicator showing who has commented on the current page.
 * Draggable to any viewport corner with a disable-site dropzone.
 */

import { LitElement, css, html, nothing } from "lit";

import type { PageCommentSummary } from "../utils/messages";

import { glossBaseStyles } from "./gloss-element";

// =============================================================================
// Types
// =============================================================================

export type IndicatorCorner =
	| "top-right"
	| "top-left"
	| "bottom-right"
	| "bottom-left";

// =============================================================================
// Storage utilities (unchanged from original)
// =============================================================================

const INDICATOR_CORNER_KEY = "glossIndicatorCorner";
const DISABLED_DOMAINS_KEY = "glossDisabledDomains";
const DEFAULT_CORNER: IndicatorCorner = "top-right";
const WWW_PREFIX = /^www\./;

export async function loadIndicatorCorner(): Promise<IndicatorCorner> {
	try {
		const result = await browser.storage.sync.get(INDICATOR_CORNER_KEY);
		return (result[INDICATOR_CORNER_KEY] as IndicatorCorner) || DEFAULT_CORNER;
	} catch {
		return DEFAULT_CORNER;
	}
}

export async function saveIndicatorCorner(
	corner: IndicatorCorner
): Promise<void> {
	try {
		await browser.storage.sync.set({ [INDICATOR_CORNER_KEY]: corner });
	} catch (error) {
		console.error("[Gloss] Failed to save indicator corner:", error);
	}
}

export async function loadDisabledDomains(): Promise<string[]> {
	try {
		const result = await browser.storage.sync.get(DISABLED_DOMAINS_KEY);
		return (result[DISABLED_DOMAINS_KEY] as string[]) || [];
	} catch {
		return [];
	}
}

export async function saveDisabledDomains(domains: string[]): Promise<void> {
	await browser.storage.sync.set({ [DISABLED_DOMAINS_KEY]: domains });
}

export async function isDomainDisabled(): Promise<boolean> {
	const domain = location.hostname.replace(WWW_PREFIX, "");
	const domains = await loadDisabledDomains();
	return domains.includes(domain);
}

export async function disableCurrentDomain(): Promise<void> {
	const domain = location.hostname.replace(WWW_PREFIX, "");
	const domains = await loadDisabledDomains();
	if (!domains.includes(domain)) {
		domains.push(domain);
		await saveDisabledDomains(domains);
	}
}

// =============================================================================
// Constants
// =============================================================================

const MAX_VISIBLE_AVATARS = 3;
const CORNER_MARGIN = 16;
const DRAG_THRESHOLD = 5;
const NAME_SPLIT_REGEX = /\s+/;

function getInitials(name: string | null): string {
	if (!name) return "?";
	const parts = name.trim().split(NAME_SPLIT_REGEX);
	if (parts.length >= 2) {
		const lastPart = parts.at(-1);
		return (parts[0][0] + (lastPart?.[0] ?? "")).toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
}

function findNearestCorner(x: number, y: number): IndicatorCorner {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const isLeft = x < vw / 2;
	const isTop = y < vh / 2;
	if (isTop && !isLeft) return "top-right";
	if (isTop && isLeft) return "top-left";
	if (!isTop && !isLeft) return "bottom-right";
	return "bottom-left";
}

// =============================================================================
// Component
// =============================================================================

interface DragState {
	startX: number;
	startY: number;
	offsetX: number;
	offsetY: number;
	thresholdExceeded: boolean;
}

export class GlossCommentIndicator extends LitElement {
	static properties = {
		summary: { type: Object },
		annotationsVisible: { type: Boolean, reflect: true },
		corner: { type: String },
		anchoredHighlightCount: { type: Number },
		_dragging: { type: Boolean, state: true },
		_showDropzone: { type: Boolean, state: true },
		_overDropzone: { type: Boolean, state: true },
	};

	static styles = [
		glossBaseStyles,
		css`
			:host {
				position: fixed;
				top: 0;
				left: 0;
				z-index: 2147483646;
				pointer-events: none;
				display: block;
			}

			.container {
				position: fixed;
				pointer-events: auto;
				animation: fade-in 0.2s ease-out;
				user-select: none;
				-webkit-user-select: none;
			}

			.container.snapping {
				transition:
					top 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
					right 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
					bottom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
					left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
			}

			.container.dismissing {
				opacity: 0;
				transform: scale(0.3);
				transition:
					opacity 0.2s ease,
					transform 0.2s ease;
			}

			@keyframes fade-in {
				from {
					opacity: 0;
					transform: translateY(-8px);
				}
				to {
					opacity: 1;
					transform: translateY(0);
				}
			}

			.btn {
				display: flex;
				align-items: center;
				gap: 8px;
				padding: 8px 14px;
				border: 1px solid rgba(0, 0, 0, 0.1);
				border-radius: 24px;
				background: rgba(255, 255, 255, 0.98);
				backdrop-filter: blur(12px);
				cursor: grab;
				transition:
					background 0.15s ease,
					box-shadow 0.15s ease,
					border-color 0.15s ease,
					transform 0.15s ease,
					opacity 0.15s ease;
				box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
				font-family: inherit;
				touch-action: none;
			}
			.btn:hover {
				background: #ffffff;
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
				transform: translateY(-1px);
			}
			.btn.active {
				background: #fef3c7;
				border-color: rgba(217, 119, 6, 0.25);
			}
			.btn.dragging {
				cursor: grabbing;
				opacity: 0.92;
				transform: scale(1.06);
				box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
			}
			.btn.over-dropzone {
				opacity: 0.5;
				transform: scale(0.9);
			}

			@media (prefers-color-scheme: dark) {
				.btn {
					background: rgba(38, 38, 38, 0.98);
					border-color: rgba(255, 255, 255, 0.12);
					box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
				}
				.btn:hover {
					background: #2a2a2a;
					box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
				}
				.btn.active {
					background: rgba(120, 53, 15, 0.95);
					border-color: rgba(217, 119, 6, 0.35);
				}
			}

			.icon {
				display: flex;
				align-items: center;
				justify-content: center;
				color: #f59e0b;
			}
			@media (prefers-color-scheme: dark) {
				.icon {
					color: #fbbf24;
				}
			}

			.count {
				font-size: 14px;
				font-weight: 600;
				color: #1a1a1a;
				min-width: 12px;
				text-align: center;
			}
			@media (prefers-color-scheme: dark) {
				.count {
					color: #e5e5e5;
				}
			}

			.avatar-stack {
				display: flex;
				flex-direction: row-reverse;
				margin-left: 2px;
			}
			.avatar {
				width: 22px;
				height: 22px;
				border-radius: 50%;
				border: 2px solid #ffffff;
				background: #e5e5e5;
				overflow: hidden;
				display: flex;
				align-items: center;
				justify-content: center;
				margin-left: -6px;
				position: relative;
				flex-shrink: 0;
			}
			.avatar:last-child {
				margin-left: 0;
			}
			.avatar img {
				width: 100%;
				height: 100%;
				object-fit: cover;
			}
			.avatar-initials {
				font-size: 9px;
				font-weight: 600;
				color: #666666;
			}

			@media (prefers-color-scheme: dark) {
				.avatar {
					border-color: #2a2a2a;
					background: #404040;
				}
				.avatar-initials {
					color: #a0a0a0;
				}
			}

			/* Disable dropzone */
			.dropzone {
				position: fixed;
				bottom: 24px;
				left: 50%;
				transform: translateX(-50%) translateY(16px);
				display: flex;
				align-items: center;
				gap: 8px;
				padding: 10px 18px;
				border-radius: 24px;
				background: rgba(220, 38, 38, 0.06);
				border: 2px dashed rgba(220, 38, 38, 0.25);
				color: #dc2626;
				font-family: inherit;
				font-size: 13px;
				font-weight: 500;
				opacity: 0;
				transition:
					opacity 0.2s ease,
					transform 0.2s ease,
					background 0.15s ease,
					border-color 0.15s ease;
				pointer-events: none;
				z-index: 1;
			}
			.dropzone.visible {
				opacity: 1;
				transform: translateX(-50%) translateY(0);
			}
			.dropzone.active {
				background: rgba(220, 38, 38, 0.12);
				border-color: rgba(220, 38, 38, 0.5);
				transform: translateX(-50%) scale(1.05);
			}

			@media (prefers-color-scheme: dark) {
				.dropzone {
					background: rgba(220, 38, 38, 0.08);
					border-color: rgba(248, 113, 113, 0.2);
					color: #f87171;
				}
				.dropzone.active {
					background: rgba(220, 38, 38, 0.18);
					border-color: rgba(248, 113, 113, 0.45);
				}
			}

			.dropzone-icon {
				display: flex;
				align-items: center;
			}
		`,
	];

	// Public reactive properties
	declare summary: PageCommentSummary | null;
	declare annotationsVisible: boolean;
	declare corner: IndicatorCorner;
	declare anchoredHighlightCount: number | undefined;

	// Internal reactive state (for CSS class changes during drag)
	declare _dragging: boolean;
	declare _showDropzone: boolean;
	declare _overDropzone: boolean;

	// Non-reactive drag internals (manipulate DOM directly for 60fps)
	private _dragState: DragState | null = null;

	constructor() {
		super();
		this.summary = null;
		this.annotationsVisible = false;
		this.corner = DEFAULT_CORNER;
		this.anchoredHighlightCount = undefined;
		this._dragging = false;
		this._showDropzone = false;
		this._overDropzone = false;
	}

	updated(changed: Map<string, unknown>): void {
		if ((changed.has("corner") || changed.has("summary")) && !this._dragging) {
			this._applyCornerPosition();
		}
	}

	render() {
		const summary = this.summary;
		if (!summary || summary.totalComments === 0) return nothing;
		if (
			this.anchoredHighlightCount !== undefined &&
			this.anchoredHighlightCount === 0
		)
			return nothing;

		const avatars = summary.commenters.slice(0, MAX_VISIBLE_AVATARS);

		return html`
			<div class="container" id="container">
				<button
					class="btn ${this.annotationsVisible ? "active" : ""} ${this._dragging ? "dragging" : ""} ${this._overDropzone ? "over-dropzone" : ""}"
					title=${this.annotationsVisible ? "Hide comments" : "Show comments"}
					@pointerdown=${this._onPointerDown}
					@pointermove=${this._onPointerMove}
					@pointerup=${this._onPointerUp}
					@pointercancel=${this._onPointerCancel}
				>
					<span class="icon">
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
							<path
								d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
							></path>
						</svg>
					</span>
					<span class="count">${summary.totalComments}</span>
					${
						avatars.length > 0
							? html`
								<div class="avatar-stack">
									${avatars.map(
										(c, i) => html`
											<div
												class="avatar"
												style="z-index: ${avatars.length - i}"
											>
												${
													c.image
														? html`<img
															src=${c.image}
															alt=${c.name || "User"}
															draggable="false"
														/>`
														: html`<span class="avatar-initials"
															>${getInitials(c.name)}</span
														>`
												}
											</div>
										`
									)}
								</div>
							`
							: nothing
					}
				</button>
			</div>

			${
				this._showDropzone
					? html`
						<div
							class="dropzone ${this._showDropzone ? "visible" : ""} ${this._overDropzone ? "active" : ""}"
						>
							<span class="dropzone-icon">
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
									<circle cx="12" cy="12" r="10" />
									<path d="m4.93 4.93 14.14 14.14" />
								</svg>
							</span>
							<span
								>Disable on
								${location.hostname.replace(WWW_PREFIX, "")}</span
							>
						</div>
					`
					: nothing
			}
		`;
	}

	// =========================================================================
	// Drag System
	// =========================================================================

	private _onPointerDown(e: PointerEvent): void {
		if (e.button !== 0) return;
		e.preventDefault();
		(e.target as HTMLElement).setPointerCapture(e.pointerId);

		const container = this.shadowRoot!.getElementById("container")!;
		const rect = container.getBoundingClientRect();
		this._dragState = {
			startX: e.clientX,
			startY: e.clientY,
			offsetX: e.clientX - rect.left,
			offsetY: e.clientY - rect.top,
			thresholdExceeded: false,
		};
	}

	private _onPointerMove(e: PointerEvent): void {
		if (!this._dragState) return;

		const dx = e.clientX - this._dragState.startX;
		const dy = e.clientY - this._dragState.startY;

		if (!this._dragState.thresholdExceeded) {
			if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD)
				return;
			this._dragState.thresholdExceeded = true;

			// Switch to absolute positioning for free drag
			const container = this.shadowRoot!.getElementById("container")!;
			const rect = container.getBoundingClientRect();
			container.style.top = `${rect.top}px`;
			container.style.left = `${rect.left}px`;
			container.style.right = "";
			container.style.bottom = "";
			this._dragging = true;
			this._showDropzone = true;
		}

		const container = this.shadowRoot!.getElementById("container")!;
		container.style.left = `${e.clientX - this._dragState.offsetX}px`;
		container.style.top = `${e.clientY - this._dragState.offsetY}px`;

		// Hit-test dropzone
		const dz = this.shadowRoot!.querySelector(
			".dropzone"
		) as HTMLElement | null;
		if (dz) {
			const rect = dz.getBoundingClientRect();
			const padding = 16;
			this._overDropzone =
				e.clientX >= rect.left - padding &&
				e.clientX <= rect.right + padding &&
				e.clientY >= rect.top - padding &&
				e.clientY <= rect.bottom + padding;
		}
	}

	private _onPointerUp(e: PointerEvent): void {
		if (!this._dragState) return;
		const wasDragging = this._dragState.thresholdExceeded;
		this._dragState = null;

		if (!wasDragging) {
			// Was a click, not a drag
			this.dispatchEvent(
				new CustomEvent("gloss-toggle-annotations", {
					bubbles: true,
					composed: true,
				})
			);
			return;
		}

		this._dragging = false;

		// Check if dropped on disable zone
		if (this._overDropzone) {
			this._overDropzone = false;
			this._showDropzone = false;

			const container = this.shadowRoot!.getElementById("container")!;
			container.classList.add("dismissing");

			disableCurrentDomain()
				.then(() => {
					this.dispatchEvent(
						new CustomEvent("gloss-disable-domain", {
							bubbles: true,
							composed: true,
						})
					);
					return undefined;
				})
				.catch(() => {});
			return;
		}

		this._overDropzone = false;
		this._showDropzone = false;

		// Snap to nearest corner
		const newCorner = findNearestCorner(e.clientX, e.clientY);
		this.corner = newCorner;

		const container = this.shadowRoot!.getElementById("container")!;
		container.classList.add("snapping");
		this._applyCornerPosition();

		const onTransitionEnd = () => {
			container.classList.remove("snapping");
			container.removeEventListener("transitionend", onTransitionEnd);
		};
		container.addEventListener("transitionend", onTransitionEnd);

		this.dispatchEvent(
			new CustomEvent("gloss-corner-change", {
				detail: { corner: newCorner },
				bubbles: true,
				composed: true,
			})
		);
	}

	private _onPointerCancel(): void {
		if (!this._dragState) return;
		this._dragState = null;
		this._dragging = false;
		this._showDropzone = false;
		this._overDropzone = false;
		this._applyCornerPosition();
	}

	// =========================================================================
	// Corner Positioning
	// =========================================================================

	private _applyCornerPosition(): void {
		const container = this.shadowRoot?.getElementById("container");
		if (!container) return;
		const m = `${CORNER_MARGIN}px`;
		container.style.top = "";
		container.style.right = "";
		container.style.bottom = "";
		container.style.left = "";
		switch (this.corner) {
			case "top-right":
				container.style.top = m;
				container.style.right = m;
				break;
			case "top-left":
				container.style.top = m;
				container.style.left = m;
				break;
			case "bottom-right":
				container.style.bottom = m;
				container.style.right = m;
				break;
			case "bottom-left":
				container.style.bottom = m;
				container.style.left = m;
				break;
		}
	}
}

if (!window.customElements.get("gloss-comment-indicator")) {
	window.customElements.define(
		"gloss-comment-indicator",
		GlossCommentIndicator
	);
}
