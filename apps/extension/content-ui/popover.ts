/**
 * Base popover positioning and lifecycle utilities.
 * Uses shadow DOM for style isolation from page styles.
 */

import { injectStyles } from "./styles";

export interface PopoverPosition {
	top: number;
	left: number;
	placement: "above" | "below";
}

export interface PopoverOptions {
	/** Target rect to position relative to */
	targetRect: DOMRect;
	/** Preferred placement (will flip if not enough space) */
	preferredPlacement?: "above" | "below";
	/** Horizontal alignment */
	align?: "start" | "center" | "end";
	/** Offset from target in pixels */
	offset?: number;
}

/**
 * Calculate optimal popover position relative to a target rect.
 */
export function calculatePosition(
	popoverRect: { width: number; height: number },
	options: PopoverOptions
): PopoverPosition {
	const {
		targetRect,
		preferredPlacement = "above",
		align = "center",
		offset = 8,
	} = options;

	const viewportHeight = window.innerHeight;
	const viewportWidth = window.innerWidth;
	const _scrollY = window.scrollY;
	const _scrollX = window.scrollX;

	// Calculate available space above and below
	const spaceAbove = targetRect.top;
	const spaceBelow = viewportHeight - targetRect.bottom;

	// Determine placement
	let placement: "above" | "below" = preferredPlacement;
	if (
		preferredPlacement === "above" &&
		spaceAbove < popoverRect.height + offset
	) {
		if (spaceBelow >= popoverRect.height + offset) {
			placement = "below";
		}
	} else if (
		preferredPlacement === "below" &&
		spaceBelow < popoverRect.height + offset &&
		spaceAbove >= popoverRect.height + offset
	) {
		placement = "above";
	}

	// Calculate vertical position
	let top: number;
	if (placement === "above") {
		top = targetRect.top - popoverRect.height - offset;
	} else {
		top = targetRect.bottom + offset;
	}

	// Calculate horizontal position
	let left: number;
	switch (align) {
		case "start":
			left = targetRect.left;
			break;
		case "end":
			left = targetRect.right - popoverRect.width;
			break;
		default:
			left = targetRect.left + (targetRect.width - popoverRect.width) / 2;
			break;
	}

	// Constrain to viewport
	left = Math.max(8, Math.min(left, viewportWidth - popoverRect.width - 8));
	top = Math.max(8, Math.min(top, viewportHeight - popoverRect.height - 8));

	return { top, left, placement };
}

/**
 * Create a shadow DOM container for a popover.
 */
export function createPopoverContainer(id: string): {
	host: HTMLElement;
	shadowRoot: ShadowRoot;
	popover: HTMLElement;
} {
	// Remove existing container if any
	const existing = document.getElementById(id);
	if (existing) {
		existing.remove();
	}

	// Create host element
	const host = document.createElement("div");
	host.id = id;
	host.style.cssText =
		"position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;";

	// Attach shadow DOM
	const shadowRoot = host.attachShadow({ mode: "closed" });

	// Inject styles
	injectStyles(shadowRoot);

	// Create popover element
	const popover = document.createElement("div");
	popover.className = "gloss-popover";
	popover.style.pointerEvents = "auto";
	shadowRoot.appendChild(popover);

	// Add to document
	document.body.appendChild(host);

	return { host, shadowRoot, popover };
}

/**
 * Position a popover element.
 */
export function positionPopover(
	popover: HTMLElement,
	options: PopoverOptions
): void {
	// First render off-screen to measure
	popover.style.visibility = "hidden";
	popover.style.top = "0";
	popover.style.left = "0";

	// Force layout to get dimensions
	const rect = popover.getBoundingClientRect();

	// Calculate position
	const position = calculatePosition(
		{ width: rect.width, height: rect.height },
		options
	);

	// Apply position
	popover.style.top = `${position.top}px`;
	popover.style.left = `${position.left}px`;
	popover.style.visibility = "visible";
}

/**
 * Hide and remove a popover with animation.
 */
export function hidePopover(
	host: HTMLElement,
	popover: HTMLElement
): Promise<void> {
	return new Promise((resolve) => {
		popover.classList.add("hiding");

		const onAnimationEnd = () => {
			popover.removeEventListener("animationend", onAnimationEnd);
			host.remove();
			resolve();
		};

		popover.addEventListener("animationend", onAnimationEnd);

		// Fallback timeout in case animation doesn't fire
		setTimeout(() => {
			if (host.parentNode) {
				host.remove();
			}
			resolve();
		}, 150);
	});
}

/**
 * Set up dismiss handlers for a popover.
 * Returns a cleanup function.
 */
export function setupDismissHandlers(
	_host: HTMLElement,
	popover: HTMLElement,
	onDismiss: () => void
): () => void {
	let isMouseInside = false;
	let clickListenerActive = false;

	const handleMouseEnter = () => {
		isMouseInside = true;
	};

	const handleMouseLeave = () => {
		isMouseInside = false;
	};

	const handleClickOutside = (e: MouseEvent) => {
		// Ignore clicks until the listener is fully active (prevents race with selection)
		if (!clickListenerActive) {
			return;
		}
		// Check if click is inside the shadow DOM
		const path = e.composedPath();
		if (!path.includes(popover)) {
			onDismiss();
		}
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			onDismiss();
		}
	};

	const handleScroll = () => {
		// Ignore scroll until listener is active (prevents race with selection)
		if (!clickListenerActive || isMouseInside) {
			return;
		}
		onDismiss();
	};

	// Add listeners
	popover.addEventListener("mouseenter", handleMouseEnter);
	popover.addEventListener("mouseleave", handleMouseLeave);
	document.addEventListener("click", handleClickOutside, true);
	document.addEventListener("keydown", handleKeyDown);
	window.addEventListener("scroll", handleScroll, true);

	// Delay activating dismiss handlers to prevent race with selection events
	setTimeout(() => {
		clickListenerActive = true;
	}, 100);

	// Return cleanup function
	return () => {
		popover.removeEventListener("mouseenter", handleMouseEnter);
		popover.removeEventListener("mouseleave", handleMouseLeave);
		document.removeEventListener("click", handleClickOutside, true);
		document.removeEventListener("keydown", handleKeyDown);
		window.removeEventListener("scroll", handleScroll, true);
	};
}

/**
 * Generate a unique ID for highlights.
 */
export function generateId(): string {
	return `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
