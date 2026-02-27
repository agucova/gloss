/**
 * Selection popover for creating highlights.
 * Shows when user selects text on a page.
 */

import { type AnnotationSelector, describe } from "@gloss/anchoring";
import { Show } from "solid-js";

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

interface SelectionPopoverProps {
	isAuthenticated: boolean;
	visible: boolean;
	style?: { top: string; left: string };
	onHighlight: () => void;
	onSignIn: () => void;
	onDismiss: () => void;
	ref?: (el: HTMLDivElement) => void;
}

export function SelectionPopover(props: SelectionPopoverProps) {
	return (
		<Show when={props.visible}>
			<div
				ref={props.ref}
				id="gloss-selection-popover"
				class="gloss-selection-popover"
				style={props.style}
			>
				<Show
					when={props.isAuthenticated}
					fallback={
						<div class="gloss-popover">
							<div class="gloss-signin-prompt">
								<p>Sign in to save highlights</p>
								<button
									type="button"
									class="gloss-btn gloss-btn-primary"
									aria-label="Sign in to Gloss"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										props.onSignIn();
										props.onDismiss();
									}}
								>
									Sign in
								</button>
							</div>
						</div>
					}
				>
					<div class="gloss-popover">
						<button
							type="button"
							class="gloss-icon-btn"
							aria-label="Create highlight"
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								props.onHighlight();
								props.onDismiss();
							}}
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
								<path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
							</svg>
						</button>
					</div>
				</Show>
			</div>
		</Show>
	);
}
