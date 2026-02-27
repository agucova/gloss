/**
 * Floating comment indicator showing who has commented on the current page.
 * Draggable to any viewport corner with a disable-site dropzone.
 */

import { For, Show, createSignal, onMount } from "solid-js";

import type { PageCommentSummary } from "../utils/messages";

import { type IndicatorCorner, disableCurrentDomain } from "./domain-settings";

const MAX_VISIBLE_AVATARS = 3;
const CORNER_MARGIN = 16;
const DRAG_THRESHOLD = 5;
const NAME_SPLIT_REGEX = /\s+/;
const WWW_PREFIX = /^www\./;

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

interface DragState {
	startX: number;
	startY: number;
	offsetX: number;
	offsetY: number;
	thresholdExceeded: boolean;
}

interface CommentIndicatorProps {
	summary: PageCommentSummary | null;
	annotationsVisible: boolean;
	corner: IndicatorCorner;
	anchoredHighlightCount: number | undefined;
	onToggleAnnotations: () => void;
	onCornerChange: (corner: IndicatorCorner) => void;
	onDisableDomain: () => void;
}

export function CommentIndicator(props: CommentIndicatorProps) {
	// oxlint-disable-next-line no-unassigned-vars -- Solid ref pattern: assigned via ref={containerRef}
	let containerRef!: HTMLDivElement;
	// oxlint-disable-next-line no-unassigned-vars -- Solid ref pattern: assigned via ref={dropzoneRef}
	let dropzoneRef!: HTMLDivElement;

	const [dragging, setDragging] = createSignal(false);
	const [showDropzone, setShowDropzone] = createSignal(false);
	const [overDropzone, setOverDropzone] = createSignal(false);

	let dragState: DragState | null = null;

	function applyCornerPosition() {
		if (!containerRef) return;
		const m = `${CORNER_MARGIN}px`;
		containerRef.style.top = "";
		containerRef.style.right = "";
		containerRef.style.bottom = "";
		containerRef.style.left = "";
		switch (props.corner) {
			case "top-right":
				containerRef.style.top = m;
				containerRef.style.right = m;
				break;
			case "top-left":
				containerRef.style.top = m;
				containerRef.style.left = m;
				break;
			case "bottom-right":
				containerRef.style.bottom = m;
				containerRef.style.right = m;
				break;
			case "bottom-left":
				containerRef.style.bottom = m;
				containerRef.style.left = m;
				break;
		}
	}

	// Apply corner position on mount and when corner/summary changes
	onMount(() => {
		applyCornerPosition();
	});

	// We need to manually watch for changes since Solid doesn't re-run onMount
	// Using a simple approach: apply position whenever render happens
	// The component will re-render when props change due to Solid reactivity

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		(e.target as HTMLElement).setPointerCapture(e.pointerId);

		if (!containerRef) return;
		const rect = containerRef.getBoundingClientRect();
		dragState = {
			startX: e.clientX,
			startY: e.clientY,
			offsetX: e.clientX - rect.left,
			offsetY: e.clientY - rect.top,
			thresholdExceeded: false,
		};
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragState || !containerRef) return;

		const dx = e.clientX - dragState.startX;
		const dy = e.clientY - dragState.startY;

		if (!dragState.thresholdExceeded) {
			if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD)
				return;
			dragState.thresholdExceeded = true;

			// Switch to absolute positioning for free drag
			const rect = containerRef.getBoundingClientRect();
			containerRef.style.top = `${rect.top}px`;
			containerRef.style.left = `${rect.left}px`;
			containerRef.style.right = "";
			containerRef.style.bottom = "";
			setDragging(true);
			setShowDropzone(true);
		}

		containerRef.style.left = `${e.clientX - dragState.offsetX}px`;
		containerRef.style.top = `${e.clientY - dragState.offsetY}px`;

		// Hit-test dropzone
		if (dropzoneRef) {
			const rect = dropzoneRef.getBoundingClientRect();
			const padding = 16;
			setOverDropzone(
				e.clientX >= rect.left - padding &&
					e.clientX <= rect.right + padding &&
					e.clientY >= rect.top - padding &&
					e.clientY <= rect.bottom + padding
			);
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragState) return;
		const wasDragging = dragState.thresholdExceeded;
		dragState = null;

		if (!wasDragging) {
			props.onToggleAnnotations();
			return;
		}

		setDragging(false);

		if (overDropzone()) {
			setOverDropzone(false);
			setShowDropzone(false);

			if (containerRef) {
				containerRef.classList.add("gloss-dismissing");
			}

			disableCurrentDomain()
				.then(() => {
					props.onDisableDomain();
					return undefined;
				})
				.catch(() => {});
			return;
		}

		setOverDropzone(false);
		setShowDropzone(false);

		const newCorner = findNearestCorner(e.clientX, e.clientY);

		if (containerRef) {
			containerRef.classList.add("gloss-snapping");
		}

		// Need to update parent and re-apply position
		props.onCornerChange(newCorner);

		// Apply corner position manually since props update is async
		if (containerRef) {
			const m = `${CORNER_MARGIN}px`;
			containerRef.style.top = "";
			containerRef.style.right = "";
			containerRef.style.bottom = "";
			containerRef.style.left = "";
			switch (newCorner) {
				case "top-right":
					containerRef.style.top = m;
					containerRef.style.right = m;
					break;
				case "top-left":
					containerRef.style.top = m;
					containerRef.style.left = m;
					break;
				case "bottom-right":
					containerRef.style.bottom = m;
					containerRef.style.right = m;
					break;
				case "bottom-left":
					containerRef.style.bottom = m;
					containerRef.style.left = m;
					break;
			}

			const onTransitionEnd = () => {
				containerRef?.classList.remove("gloss-snapping");
				containerRef?.removeEventListener("transitionend", onTransitionEnd);
			};
			containerRef.addEventListener("transitionend", onTransitionEnd);
		}
	}

	function onPointerCancel() {
		if (!dragState) return;
		dragState = null;
		setDragging(false);
		setShowDropzone(false);
		setOverDropzone(false);
		applyCornerPosition();
	}

	const summaryGuard = () =>
		props.summary &&
		props.summary.totalComments > 0 &&
		(props.anchoredHighlightCount === undefined ||
			props.anchoredHighlightCount > 0)
			? props.summary
			: undefined;

	return (
		<Show when={summaryGuard()}>
			{(summary) => {
				const visibleCommenters = () =>
					summary().commenters.slice(0, MAX_VISIBLE_AVATARS);

				return (
					<div id="gloss-comment-indicator" class="gloss-indicator-host">
						<div ref={containerRef} class="gloss-indicator-container">
							<button
								type="button"
								class={`gloss-indicator-btn ${props.annotationsVisible ? "active" : ""} ${dragging() ? "dragging" : ""} ${overDropzone() ? "over-dropzone" : ""}`}
								title={
									props.annotationsVisible ? "Hide comments" : "Show comments"
								}
								onPointerDown={onPointerDown}
								onPointerMove={onPointerMove}
								onPointerUp={onPointerUp}
								onPointerCancel={onPointerCancel}
							>
								<span class="gloss-indicator-icon">
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
										<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
									</svg>
								</span>
								<span class="gloss-indicator-count">
									{summary().totalComments}
								</span>
								<Show when={visibleCommenters().length > 0}>
									<div class="gloss-avatar-stack">
										<For each={visibleCommenters()}>
											{(c, i) => (
												<div
													class="gloss-avatar"
													style={{
														"z-index": `${visibleCommenters().length - i()}`,
													}}
												>
													<Show
														when={c.image}
														fallback={
															<span class="gloss-avatar-initials">
																{getInitials(c.name)}
															</span>
														}
													>
														{(imageSrc) => (
															<img
																src={imageSrc()}
																alt={c.name || "User"}
																draggable={false}
															/>
														)}
													</Show>
												</div>
											)}
										</For>
									</div>
								</Show>
							</button>
						</div>

						<Show when={showDropzone()}>
							<div
								ref={dropzoneRef}
								class={`gloss-dropzone ${showDropzone() ? "visible" : ""} ${overDropzone() ? "active" : ""}`}
							>
								<span class="gloss-dropzone-icon">
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
								<span>
									Disable on {location.hostname.replace(WWW_PREFIX, "")}
								</span>
							</div>
						</Show>
					</div>
				);
			}}
		</Show>
	);
}
