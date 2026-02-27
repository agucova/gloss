/**
 * Margin annotations container.
 * Reads Solid store signals and auto-rerenders when comment data or visibility changes.
 */

import { For, Show, createSignal, onCleanup, onMount } from "solid-js";

import { AnnotationItem } from "./annotation-item";
import { annotationsVisible, commentSummary, manager } from "./store";

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

interface MarginAnnotationsProps {
	onAnnotationClick: (highlightId: string, element: HTMLElement | null) => void;
}

export function MarginAnnotations(props: MarginAnnotationsProps) {
	const [mode, setMode] = createSignal<"full" | "compact" | "dots">("full");
	let resizeObserver: ResizeObserver | null = null;
	let resizeDebounce: ReturnType<typeof setTimeout> | null = null;

	function detectMode(): "full" | "compact" | "dots" {
		const viewportWidth = window.innerWidth;
		const contentWidth = estimateContentWidth();
		const rightMargin = viewportWidth - contentWidth - VIEWPORT_PADDING;

		if (rightMargin >= MIN_MARGIN_FULL) return "full";
		if (rightMargin >= MIN_MARGIN_COMPACT) return "compact";
		return "dots";
	}

	function estimateContentWidth(): number {
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

	onMount(() => {
		setMode(detectMode());
		resizeObserver = new ResizeObserver(() => {
			if (resizeDebounce) clearTimeout(resizeDebounce);
			resizeDebounce = setTimeout(() => {
				const newMode = detectMode();
				if (newMode !== mode()) setMode(newMode);
			}, 150);
		});
		resizeObserver.observe(document.body);
	});

	onCleanup(() => {
		resizeObserver?.disconnect();
		resizeObserver = null;
		if (resizeDebounce) {
			clearTimeout(resizeDebounce);
			resizeDebounce = null;
		}
	});

	const items = () => {
		const summary = commentSummary();
		const mgr = manager();
		if (!summary || !mgr) return [];

		return summary.highlightComments
			.map((hc) => {
				const active = mgr.get(hc.highlightId);
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
	};

	return (
		<Show
			when={
				annotationsVisible() &&
				commentSummary() &&
				manager() &&
				items().length > 0
			}
		>
			<div class="gloss-margin-annotations-host">
				<For each={items()}>
					{(item) => (
						<AnnotationItem
							comments={item.comments}
							anchor={item.anchor}
							highlightId={item.highlightId}
							mode={mode()}
							onClick={props.onAnnotationClick}
						/>
					)}
				</For>
			</div>
		</Show>
	);
}
