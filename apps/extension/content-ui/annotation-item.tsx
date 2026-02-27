/**
 * Individual margin annotation element.
 * Positioned via useFloating relative to a highlight element.
 */

import { Show, createEffect, onCleanup } from "solid-js";

import type { ServerComment } from "../utils/messages";

import { formatRelativeTime } from "./comment-utils";
import { getDefaultPlacement, useFloating } from "./use-floating";

interface AnnotationItemProps {
	comments: ServerComment[];
	anchor: HTMLElement | null;
	highlightId: string;
	mode: "full" | "compact" | "dots";
	onClick: (highlightId: string, element: HTMLElement | null) => void;
}

export function AnnotationItem(props: AnnotationItemProps) {
	// oxlint-disable-next-line no-unassigned-vars -- Solid ref pattern: assigned via ref={itemRef}
	let itemRef!: HTMLDivElement;

	const floating = useFloating({
		placement: getDefaultPlacement(),
		offsetDistance: 24,
		viewportPadding: 8,
		enableFlip: true,
		fallbackPlacements: ["left", "bottom"],
	});

	createEffect(() => {
		if (props.anchor && itemRef) {
			floating.attach(props.anchor, itemRef);
		}
	});

	onCleanup(() => {
		floating.detach();
	});

	function handleClick(e: Event) {
		e.preventDefault();
		e.stopPropagation();
		props.onClick(props.highlightId, props.anchor);
	}

	return (
		<Show when={props.comments.length > 0}>
			<div ref={itemRef} class="gloss-annotation-item-host">
				<Show
					when={props.mode === "dots"}
					fallback={
						<TextAnnotation
							comments={props.comments}
							mode={props.mode}
							onClick={handleClick}
						/>
					}
				>
					<PillAnnotation count={props.comments.length} onClick={handleClick} />
				</Show>
			</div>
		</Show>
	);
}

function TextAnnotation(props: {
	comments: ServerComment[];
	mode: "full" | "compact" | "dots";
	onClick: (e: Event) => void;
}) {
	const isCompact = () => props.mode === "compact";

	const sorted = () =>
		[...props.comments].toSorted(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		);

	const first = () => sorted()[0];

	return (
		<Show when={first()}>
			{(comment) => {
				const authorName = () => comment().author.name || "Someone";
				const time = () => formatRelativeTime(comment().createdAt);
				const text = () => {
					const maxLen = isCompact() ? 80 : 150;
					const content = comment().content;
					return content.length > maxLen
						? `${content.slice(0, maxLen)}...`
						: content;
				};
				const width = () => (isCompact() ? 140 : 240);

				return (
					<button
						type="button"
						class={`gloss-annotation ${isCompact() ? "compact" : ""}`}
						style={{ width: `${width()}px` }}
						onClick={props.onClick}
					>
						<div class="gloss-annotation-author">
							{isCompact() ? authorName() : `${authorName()} \u00B7 ${time()}`}
						</div>
						<div class="gloss-annotation-preview">{text()}</div>
						<Show when={props.comments.length > 1}>
							<div class="gloss-annotation-more">
								+{props.comments.length - 1} more
							</div>
						</Show>
					</button>
				);
			}}
		</Show>
	);
}

function PillAnnotation(props: { count: number; onClick: (e: Event) => void }) {
	return (
		<button
			type="button"
			class="gloss-annotation-pill"
			title={`${props.count} note${props.count > 1 ? "s" : ""}`}
			onClick={props.onClick}
		>
			<span class="gloss-pill-icon">
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
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
				</svg>
			</span>
			<span class="gloss-pill-count">{props.count}</span>
		</button>
	);
}
