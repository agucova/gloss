/**
 * Lit ReactiveController for Floating UI positioning.
 * Manages autoUpdate lifecycle tied to component connect/disconnect.
 */

import type { ReactiveController, ReactiveControllerHost } from "lit";

import {
	autoUpdate,
	computePosition,
	flip,
	hide,
	offset,
	type Placement,
	shift,
} from "@floating-ui/dom";

export type AnnotationPlacement = "right" | "left" | "bottom" | "top";

export interface FloatingControllerOptions {
	/** Preferred placement relative to anchor */
	placement?: AnnotationPlacement;
	/** Offset from the anchor element in pixels */
	offsetDistance?: number;
	/** Padding from viewport edges */
	viewportPadding?: number;
	/** Whether to flip to opposite side if no space */
	enableFlip?: boolean;
	/** Fallback placements when flipping */
	fallbackPlacements?: AnnotationPlacement[];
}

const SCROLLABLE_OVERFLOW_RE = /(auto|scroll)/;

function toFloatingPlacement(p: AnnotationPlacement): Placement {
	const map: Record<AnnotationPlacement, Placement> = {
		right: "right-start",
		left: "left-start",
		bottom: "bottom-start",
		top: "top-start",
	};
	return map[p] ?? "right-start";
}

export class FloatingController implements ReactiveController {
	private _cleanup: (() => void) | null = null;
	private _anchor: HTMLElement | null = null;
	private _floating: HTMLElement | null = null;
	private _options: Required<FloatingControllerOptions>;

	constructor(
		private _host: ReactiveControllerHost & HTMLElement,
		options: FloatingControllerOptions = {}
	) {
		this._options = {
			placement: "right",
			offsetDistance: 16,
			viewportPadding: 8,
			enableFlip: true,
			fallbackPlacements: ["left", "bottom", "top"],
			...options,
		};
		this._host.addController(this);
	}

	/**
	 * Start tracking position of the floating element relative to the anchor.
	 * Call from firstUpdated() or updated() once both elements are in the DOM.
	 */
	attach(anchor: HTMLElement, floating: HTMLElement): void {
		this.detach();
		this._anchor = anchor;
		this._floating = floating;

		const opts = this._options;

		const middleware = [
			offset(opts.offsetDistance),
			shift({ padding: opts.viewportPadding, crossAxis: true }),
		];

		if (opts.enableFlip) {
			middleware.push(
				flip({
					fallbackPlacements: opts.fallbackPlacements.map(toFloatingPlacement),
					padding: opts.viewportPadding,
				})
			);
		}

		middleware.push(hide({ strategy: "referenceHidden" }));

		const placement = toFloatingPlacement(opts.placement);

		floating.style.position = "fixed";
		floating.style.left = "0";
		floating.style.top = "0";

		const updatePosition = async () => {
			if (!(this._anchor && this._floating)) return;
			try {
				const result = await computePosition(this._anchor, this._floating, {
					placement,
					middleware,
					strategy: "fixed",
				});

				const isHidden = result.middlewareData.hide?.referenceHidden ?? false;

				Object.assign(this._floating.style, {
					left: `${result.x}px`,
					top: `${result.y}px`,
					visibility: isHidden ? "hidden" : "visible",
				});
			} catch {
				if (this._floating) this._floating.style.visibility = "hidden";
			}
		};

		this._cleanup = autoUpdate(anchor, floating, updatePosition, {
			ancestorScroll: true,
			ancestorResize: true,
			elementResize: true,
			layoutShift: true,
		});
	}

	/** Stop tracking position and clean up autoUpdate. */
	detach(): void {
		this._cleanup?.();
		this._cleanup = null;
		this._anchor = null;
		this._floating = null;
	}

	hostConnected(): void {
		// Re-attach handled by component's updated() if needed
	}

	hostDisconnected(): void {
		this.detach();
	}
}

/** Check if the document uses RTL layout. */
export function isRTL(): boolean {
	return (
		document.dir === "rtl" ||
		getComputedStyle(document.body).direction === "rtl"
	);
}

/** Get the appropriate default placement based on document direction. */
export function getDefaultPlacement(): AnnotationPlacement {
	return isRTL() ? "left" : "right";
}

/** Check if an element is in a scrollable container. */
export function hasScrollableAncestor(element: HTMLElement): boolean {
	let current: HTMLElement | null = element.parentElement;
	while (current) {
		const style = getComputedStyle(current);
		const overflow = style.overflow + style.overflowY + style.overflowX;
		if (SCROLLABLE_OVERFLOW_RE.test(overflow)) return true;
		current = current.parentElement;
	}
	return false;
}
