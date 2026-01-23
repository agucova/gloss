/**
 * FloatingAnnotation - Wrapper around Floating UI for robust positioning.
 *
 * Provides a consistent API for positioning annotations relative to
 * anchor elements. Uses Floating UI's autoUpdate to handle all scroll
 * and resize scenarios automatically.
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

export type AnnotationPlacement = "right" | "left" | "bottom" | "top";

export interface FloatingAnnotationOptions {
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
	/** Called when position updates */
	onPositionUpdate?: (x: number, y: number, placement: Placement) => void;
}

const DEFAULT_OPTIONS: Required<FloatingAnnotationOptions> = {
	placement: "right",
	offsetDistance: 16,
	viewportPadding: 8,
	enableFlip: true,
	fallbackPlacements: ["left", "bottom", "top"],
	onPositionUpdate: () => {},
};

/**
 * Convert our simple placement to Floating UI placement.
 */
function toFloatingPlacement(placement: AnnotationPlacement): Placement {
	switch (placement) {
		case "right":
			return "right-start";
		case "left":
			return "left-start";
		case "bottom":
			return "bottom-start";
		case "top":
			return "top-start";
	}
}

/**
 * Position a floating element relative to an anchor.
 *
 * Uses Floating UI's autoUpdate to automatically reposition when:
 * - The anchor element moves (scroll, resize, DOM changes)
 * - The floating element resizes
 * - Any scrollable ancestor scrolls
 *
 * @param anchor - The reference element to position relative to
 * @param floating - The floating element to position
 * @param options - Positioning configuration
 * @returns Cleanup function to stop positioning updates
 *
 * @example
 * ```typescript
 * const cleanup = mountFloatingAnnotation(
 *   highlightElement,
 *   annotationElement,
 *   { placement: 'right', offsetDistance: 16 }
 * );
 *
 * // Later, to stop updates:
 * cleanup();
 * ```
 */
export function mountFloatingAnnotation(
	anchor: HTMLElement,
	floating: HTMLElement,
	options: FloatingAnnotationOptions = {}
): () => void {
	const config = { ...DEFAULT_OPTIONS, ...options };

	// Build middleware stack
	const middleware = [
		offset(config.offsetDistance),
		shift({ padding: config.viewportPadding, crossAxis: true }),
	];

	if (config.enableFlip) {
		middleware.push(
			flip({
				fallbackPlacements: config.fallbackPlacements.map(toFloatingPlacement),
				padding: config.viewportPadding,
			})
		);
	}

	// Add hide middleware to detect when reference is out of view
	middleware.push(hide({ strategy: "referenceHidden" }));

	const placement = toFloatingPlacement(config.placement);

	// Set initial styles
	floating.style.position = "fixed";
	floating.style.left = "0";
	floating.style.top = "0";

	// Update function called by autoUpdate
	const updatePosition = async () => {
		const result = await computePosition(anchor, floating, {
			placement,
			middleware,
			strategy: "fixed",
		});

		// Hide the floating element when the reference (highlight) is out of view
		const isHidden = result.middlewareData.hide?.referenceHidden ?? false;

		Object.assign(floating.style, {
			left: `${result.x}px`,
			top: `${result.y}px`,
			visibility: isHidden ? "hidden" : "visible",
		});

		config.onPositionUpdate(result.x, result.y, result.placement);
	};

	// Start autoUpdate - handles all scroll/resize scenarios
	const cleanup = autoUpdate(anchor, floating, updatePosition, {
		ancestorScroll: true,
		ancestorResize: true,
		elementResize: true,
		layoutShift: true,
	});

	return cleanup;
}

/**
 * Compute position once without starting auto-updates.
 * Useful for measuring or one-time positioning.
 */
export async function computeAnnotationPosition(
	anchor: HTMLElement,
	floating: HTMLElement,
	options: FloatingAnnotationOptions = {}
): Promise<{ x: number; y: number; placement: Placement }> {
	const config = { ...DEFAULT_OPTIONS, ...options };

	const middleware = [
		offset(config.offsetDistance),
		shift({ padding: config.viewportPadding, crossAxis: true }),
	];

	if (config.enableFlip) {
		middleware.push(
			flip({
				fallbackPlacements: config.fallbackPlacements.map(toFloatingPlacement),
				padding: config.viewportPadding,
			})
		);
	}

	const result = await computePosition(anchor, floating, {
		placement: toFloatingPlacement(config.placement),
		middleware,
		strategy: "fixed",
	});

	return {
		x: result.x,
		y: result.y,
		placement: result.placement,
	};
}

/**
 * Check if an element is in a scrollable container.
 * Useful for determining if scroll tracking is needed.
 */
export function hasScrollableAncestor(element: HTMLElement): boolean {
	let current: HTMLElement | null = element.parentElement;

	while (current) {
		const style = getComputedStyle(current);
		const overflow = style.overflow + style.overflowY + style.overflowX;

		if (/(auto|scroll)/.test(overflow)) {
			return true;
		}
		current = current.parentElement;
	}

	return false;
}

/**
 * Detect if the document uses RTL layout.
 */
export function isRTL(): boolean {
	return (
		document.dir === "rtl" ||
		getComputedStyle(document.body).direction === "rtl"
	);
}

/**
 * Get the appropriate default placement based on document direction.
 */
export function getDefaultPlacement(): AnnotationPlacement {
	return isRTL() ? "left" : "right";
}
