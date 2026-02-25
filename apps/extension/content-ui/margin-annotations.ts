/**
 * Margin annotations container.
 * Subscribes to glossState signals and automatically re-renders
 * when comment data or visibility changes.
 *
 * Renders <gloss-annotation-item> children, each positioned via
 * FloatingController relative to their highlight element.
 */

import { LitElement, css, html, nothing } from "lit";

import "./annotation-item";
import { glossBaseStyles } from "./gloss-element";
import { SignalWatcher, glossState } from "./store";

const MIN_MARGIN_FULL = 200;
const MIN_MARGIN_COMPACT = 120;
const VIEWPORT_PADDING = 8;

const CONTENT_SELECTORS = [
	"article",
	"main",
	".content",
	".article",
	".post",
	".entry-content",
	".prose",
	'[role="main"]',
];

export class GlossMarginAnnotations extends LitElement {
	static properties = {
		_mode: { type: String, state: true },
	};

	static styles = [
		glossBaseStyles,
		css`
			:host {
				position: fixed;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				z-index: 2147483645;
				pointer-events: none;
				display: block;
			}
		`,
	];

	// Reactive signal subscriptions — auto-re-render on change
	private _summary = new SignalWatcher(this, glossState.commentSummary);
	private _visible = new SignalWatcher(this, glossState.annotationsVisible);
	private _manager = new SignalWatcher(this, glossState.manager);

	declare _mode: "full" | "compact" | "dots";
	private _resizeObserver: ResizeObserver | null = null;
	private _resizeDebounce: ReturnType<typeof setTimeout> | null = null;

	constructor() {
		super();
		this._mode = "full";
	}

	connectedCallback(): void {
		super.connectedCallback();
		this._mode = this._detectMode();
		this._resizeObserver = new ResizeObserver(() => {
			if (this._resizeDebounce) clearTimeout(this._resizeDebounce);
			this._resizeDebounce = setTimeout(() => {
				const newMode = this._detectMode();
				if (newMode !== this._mode) this._mode = newMode;
			}, 150);
		});
		this._resizeObserver.observe(document.body);
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		this._resizeObserver?.disconnect();
		this._resizeObserver = null;
		if (this._resizeDebounce) {
			clearTimeout(this._resizeDebounce);
			this._resizeDebounce = null;
		}
	}

	render() {
		const summary = this._summary.value;
		const visible = this._visible.value;
		const manager = this._manager.value;

		if (
			!visible ||
			!summary ||
			!manager ||
			summary.highlightComments.length === 0
		) {
			return nothing;
		}

		// Collect annotations with their anchor elements
		const items = summary.highlightComments
			.map((hc) => {
				const active = manager.get(hc.highlightId);
				if (!active || active.elements.length === 0) return null;
				return {
					highlightId: hc.highlightId,
					comments: hc.comments,
					anchor: active.elements[0],
				};
			})
			.filter(
				(
					item
				): item is {
					highlightId: string;
					comments: (typeof summary.highlightComments)[0]["comments"];
					anchor: HTMLElement;
				} => item !== null
			);

		return html`
			${items.map(
				(item) => html`
					<gloss-annotation-item
						.comments=${item.comments}
						.anchor=${item.anchor}
						.highlightId=${item.highlightId}
						.mode=${this._mode}
					></gloss-annotation-item>
				`
			)}
		`;
	}

	private _detectMode(): "full" | "compact" | "dots" {
		const viewportWidth = window.innerWidth;
		const contentWidth = this._estimateContentWidth();
		const rightMargin = viewportWidth - contentWidth - VIEWPORT_PADDING;

		if (rightMargin >= MIN_MARGIN_FULL) return "full";
		if (rightMargin >= MIN_MARGIN_COMPACT) return "compact";
		return "dots";
	}

	private _estimateContentWidth(): number {
		for (const selector of CONTENT_SELECTORS) {
			const el = document.querySelector(selector);
			if (el) {
				const rect = el.getBoundingClientRect();
				if (rect.width > 0 && rect.width < window.innerWidth * 0.9) {
					return rect.right;
				}
			}
		}

		const bodyStyle = getComputedStyle(document.body);
		const bodyWidth =
			document.body.offsetWidth -
			Number.parseFloat(bodyStyle.paddingLeft) -
			Number.parseFloat(bodyStyle.paddingRight);

		if (bodyWidth < window.innerWidth * 0.8) {
			return bodyWidth + Number.parseFloat(bodyStyle.paddingLeft);
		}

		return window.innerWidth * 0.7;
	}
}

if (!window.customElements.get("gloss-margin-annotations")) {
	window.customElements.define("gloss-margin-annotations", GlossMarginAnnotations);
}
