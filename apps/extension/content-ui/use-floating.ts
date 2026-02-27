/**
 * Solid hook for Floating UI positioning.
 * Manages autoUpdate lifecycle with onCleanup.
 */

import {
	autoUpdate,
	computePosition,
	flip,
	hide,
	offset,
	type Placement,
	shift,
} from "@floating-ui/dom";
import { onCleanup } from "solid-js";

export type AnnotationPlacement = "right" | "left" | "bottom" | "top";

export interface FloatingOptions {
	placement?: AnnotationPlacement;
	offsetDistance?: number;
	viewportPadding?: number;
	enableFlip?: boolean;
	fallbackPlacements?: AnnotationPlacement[];
}

function toFloatingPlacement(p: AnnotationPlacement): Placement {
	const map: Record<AnnotationPlacement, Placement> = {
		right: "right-start",
		left: "left-start",
		bottom: "bottom-start",
		top: "top-start",
	};
	return map[p] ?? "right-start";
}

export function useFloating(options: FloatingOptions = {}) {
	const opts = {
		placement: options.placement ?? ("right" as AnnotationPlacement),
		offsetDistance: options.offsetDistance ?? 16,
		viewportPadding: options.viewportPadding ?? 8,
		enableFlip: options.enableFlip ?? true,
		fallbackPlacements:
			options.fallbackPlacements ??
			(["left", "bottom", "top"] as AnnotationPlacement[]),
	};

	let cleanup: (() => void) | null = null;

	function attach(anchor: HTMLElement, floating: HTMLElement): void {
		detach();

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
			try {
				const result = await computePosition(anchor, floating, {
					placement,
					middleware,
					strategy: "fixed",
				});

				const isHidden = result.middlewareData.hide?.referenceHidden ?? false;

				Object.assign(floating.style, {
					left: `${result.x}px`,
					top: `${result.y}px`,
					visibility: isHidden ? "hidden" : "visible",
				});
			} catch {
				floating.style.visibility = "hidden";
			}
		};

		cleanup = autoUpdate(anchor, floating, updatePosition, {
			ancestorScroll: true,
			ancestorResize: true,
			elementResize: true,
			layoutShift: true,
		});
	}

	function detach(): void {
		cleanup?.();
		cleanup = null;
	}

	onCleanup(detach);

	return { attach, detach };
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
	const re = /(auto|scroll)/;
	let current: HTMLElement | null = element.parentElement;
	while (current) {
		const style = getComputedStyle(current);
		const overflow = style.overflow + style.overflowY + style.overflowX;
		if (re.test(overflow)) return true;
		current = current.parentElement;
	}
	return false;
}
