/**
 * Root Solid component for the Gloss content script UI.
 * Renders all sub-components and manages shared state.
 */

import type { ActiveHighlight } from "@gloss/anchoring";

import { createSignal } from "solid-js";

import type { Friend, ServerComment } from "../utils/messages";
import type { IndicatorCorner } from "./domain-settings";

import { CommentIndicator } from "./comment-indicator";
import { CommentPanel, type SetMentionResultsFn } from "./comment-panel";
import { MarginAnnotations } from "./margin-annotations";
import { SelectionPopover } from "./selection-popover";
import { annotationsVisible, commentSummary, isAuthenticated } from "./store";

export interface GlossAppCallbacks {
	onHighlight: () => void;
	onSignIn: () => void;
	onToggleAnnotations: () => void;
	onCornerChange: (corner: IndicatorCorner) => void;
	onDisableDomain: () => void;
	onAnnotationClick: (highlightId: string, element: HTMLElement | null) => void;
	onCreateComment: (
		content: string,
		mentions: string[],
		parentId?: string
	) => void;
	onDeleteComment: (commentId: string) => void;
	onDeleteHighlight: () => void;
	onSearchFriends: (query: string) => void;
	onPanelClosed: () => void;
}

export interface GlossAppApi {
	showPopover(rect: DOMRect): void;
	hidePopover(): void;
	setIndicatorCorner(corner: IndicatorCorner): void;
	setAnchoredHighlightCount(count: number | undefined): void;
	showPanel(opts: {
		highlight: ActiveHighlight;
		element: HTMLElement;
		isOwner: boolean;
		currentUserId: string;
		comments: ServerComment[];
		serverId: string;
		highlightId: string;
	}): void;
	hidePanel(): void;
	setPanelComments(comments: ServerComment[]): void;
	readonly panelServerId: string;
	readonly panelHighlightId: string;
	readonly panelVisible: boolean;
	setMentionResults(friends: Friend[]): void;
}

interface GlossAppProps {
	callbacks: GlossAppCallbacks;
	apiRef?: (api: GlossAppApi) => void;
}

export function GlossApp(props: GlossAppProps) {
	// Selection popover state
	const [popoverVisible, setPopoverVisible] = createSignal(false);
	const [popoverStyle, setPopoverStyle] = createSignal<{
		top: string;
		left: string;
	}>({
		top: "0px",
		left: "0px",
	});

	// Comment indicator state
	const [indicatorCorner, setIndicatorCorner] =
		createSignal<IndicatorCorner>("top-right");
	const [anchoredHighlightCount, setAnchoredHighlightCount] = createSignal<
		number | undefined
	>(undefined);

	// Comment panel state
	const [panelVisible, setPanelVisible] = createSignal(false);
	const [panelHighlight, setPanelHighlight] =
		createSignal<ActiveHighlight | null>(null);
	const [panelElement, setPanelElement] = createSignal<HTMLElement | null>(
		null
	);
	const [panelIsOwner, setPanelIsOwner] = createSignal(false);
	const [panelCurrentUserId, setPanelCurrentUserId] = createSignal("");
	const [panelComments, setPanelComments] = createSignal<ServerComment[]>([]);
	const [panelServerId, setPanelServerId] = createSignal<string>("");
	const [panelHighlightId, setPanelHighlightId] = createSignal<string>("");

	// Mention results callback ref
	let setMentionResultsFn: SetMentionResultsFn | null = null;

	// Expose imperative API for content.ts to call
	const api = {
		showPopover(rect: DOMRect) {
			const viewportWidth = window.innerWidth;
			const offset = 4;

			let top = rect.top - 40 - offset;
			let left = rect.right + offset;

			if (top < 8) {
				top = rect.bottom + offset;
			}

			left = Math.max(8, Math.min(left, viewportWidth - 48));
			top = Math.max(8, Math.min(top, window.innerHeight - 48));

			setPopoverStyle({ top: `${top}px`, left: `${left}px` });
			setPopoverVisible(true);
		},
		hidePopover() {
			setPopoverVisible(false);
		},
		setIndicatorCorner,
		setAnchoredHighlightCount,
		showPanel(opts: {
			highlight: ActiveHighlight;
			element: HTMLElement;
			isOwner: boolean;
			currentUserId: string;
			comments: ServerComment[];
			serverId: string;
			highlightId: string;
		}) {
			setPanelHighlight(opts.highlight);
			setPanelElement(opts.element);
			setPanelIsOwner(opts.isOwner);
			setPanelCurrentUserId(opts.currentUserId);
			setPanelComments(opts.comments);
			setPanelServerId(opts.serverId);
			setPanelHighlightId(opts.highlightId);
			setPanelVisible(true);
		},
		hidePanel() {
			setPanelVisible(false);
		},
		setPanelComments,
		get panelServerId() {
			return panelServerId();
		},
		get panelHighlightId() {
			return panelHighlightId();
		},
		get panelVisible() {
			return panelVisible();
		},
		setMentionResults(friends: Friend[]) {
			setMentionResultsFn?.(friends);
		},
	};

	// Expose API to parent via ref callback
	props.apiRef?.(api);

	return (
		<>
			<SelectionPopover
				isAuthenticated={isAuthenticated()}
				visible={popoverVisible()}
				style={popoverStyle()}
				onHighlight={props.callbacks.onHighlight}
				onSignIn={props.callbacks.onSignIn}
				onDismiss={() => setPopoverVisible(false)}
			/>

			<CommentIndicator
				summary={commentSummary()}
				annotationsVisible={annotationsVisible()}
				corner={indicatorCorner()}
				anchoredHighlightCount={anchoredHighlightCount()}
				onToggleAnnotations={props.callbacks.onToggleAnnotations}
				onCornerChange={props.callbacks.onCornerChange}
				onDisableDomain={props.callbacks.onDisableDomain}
			/>

			<MarginAnnotations
				onAnnotationClick={props.callbacks.onAnnotationClick}
			/>

			<CommentPanel
				highlight={panelHighlight()}
				element={panelElement()}
				isOwner={panelIsOwner()}
				currentUserId={panelCurrentUserId()}
				comments={panelComments()}
				visible={panelVisible()}
				onCreateComment={(content, mentions, parentId) => {
					props.callbacks.onCreateComment(content, mentions, parentId);
				}}
				onDeleteComment={props.callbacks.onDeleteComment}
				onDeleteHighlight={props.callbacks.onDeleteHighlight}
				onSearchFriends={props.callbacks.onSearchFriends}
				onClose={props.callbacks.onPanelClosed}
				onSetVisible={setPanelVisible}
				mentionResultsRef={(fn: SetMentionResultsFn) => {
					setMentionResultsFn = fn;
				}}
			/>
		</>
	);
}
