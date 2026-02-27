/**
 * Solid hook for dismiss-on-click-outside behavior.
 * Handles click outside, Escape key, and scroll events.
 */

import { onCleanup } from "solid-js";

export function useDismissHandlers(
	getElement: () => HTMLElement | null,
	onDismiss: () => void
) {
	let cleanupFn: (() => void) | null = null;

	function setup(): void {
		teardown();

		let clickListenerActive = false;
		let isMouseInside = false;
		let hasFocusInside = false;

		const el = getElement();
		if (!el) return;

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
			if (!path.includes(el)) {
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

		el.addEventListener("mouseenter", handleMouseEnter);
		el.addEventListener("mouseleave", handleMouseLeave);
		el.addEventListener("focusin", handleFocusIn);
		el.addEventListener("focusout", handleFocusOut);
		document.addEventListener("click", handleClickOutside, true);
		document.addEventListener("keydown", handleKeyDown);
		window.addEventListener("scroll", handleScroll, true);

		// Delay activation to prevent race with the click/selection that triggered opening
		setTimeout(() => {
			clickListenerActive = true;
		}, 100);

		cleanupFn = () => {
			el.removeEventListener("mouseenter", handleMouseEnter);
			el.removeEventListener("mouseleave", handleMouseLeave);
			el.removeEventListener("focusin", handleFocusIn);
			el.removeEventListener("focusout", handleFocusOut);
			document.removeEventListener("click", handleClickOutside, true);
			document.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("scroll", handleScroll, true);
		};
	}

	function teardown(): void {
		cleanupFn?.();
		cleanupFn = null;
	}

	onCleanup(teardown);

	return { setup, teardown };
}
