/**
 * Comment panel for viewing and adding comments on highlights.
 * Shows when clicking a highlight or a margin annotation.
 */

import type { ActiveHighlight } from "@gloss/anchoring";

import { For, Show, createEffect, createSignal, on } from "solid-js";

import type { Friend, ServerComment } from "../utils/messages";

import {
	type CommentThread,
	buildCommentTree,
	formatRelativeTime,
	renderMarkdown,
} from "./comment-utils";
import { useDismissHandlers } from "./use-dismiss";
import { getDefaultPlacement, useFloating } from "./use-floating";

interface CommentPanelProps {
	highlight: ActiveHighlight | null;
	element: HTMLElement | null;
	isOwner: boolean;
	currentUserId: string;
	comments: ServerComment[];
	visible: boolean;
	onCreateComment: (
		content: string,
		mentions: string[],
		parentId?: string
	) => void;
	onDeleteComment: (commentId: string) => void;
	onDeleteHighlight: () => void;
	onSearchFriends: (query: string) => void;
	onClose: () => void;
	onSetVisible: (visible: boolean) => void;
	mentionResultsRef?: (fn: SetMentionResultsFn) => void;
}

export function CommentPanel(props: CommentPanelProps) {
	// oxlint-disable-next-line no-unassigned-vars -- Solid ref pattern: assigned via ref={panelRef}
	let panelRef!: HTMLDivElement;
	// oxlint-disable-next-line no-unassigned-vars -- Solid ref pattern: assigned via ref={textareaRef}
	let textareaRef!: HTMLTextAreaElement;

	const [replyingTo, setReplyingTo] = createSignal<string | null>(null);
	const [mentionFriends, setMentionFriends] = createSignal<Friend[]>([]);
	const [mentionSelectedIndex, setMentionSelectedIndex] = createSignal(0);
	const [showMentions, setShowMentions] = createSignal(false);
	const [submitting, setSubmitting] = createSignal(false);

	let mentionStartPos = -1;

	const floating = useFloating({
		placement: getDefaultPlacement(),
		offsetDistance: 16,
		viewportPadding: 16,
		enableFlip: true,
		fallbackPlacements: ["left", "bottom", "top"],
	});

	const dismiss = useDismissHandlers(
		() => panelRef ?? null,
		() => props.onSetVisible(false)
	);

	// Attach floating + dismiss when visible and element is set
	createEffect(() => {
		if (props.visible && props.element && panelRef) {
			floating.attach(props.element, panelRef);
			dismiss.setup();
		}
	});

	// Clean up when visibility changes to false
	createEffect(
		on(
			() => props.visible,
			(visible, prevVisible) => {
				if (!visible && prevVisible) {
					floating.detach();
					dismiss.teardown();
					setReplyingTo(null);
					setShowMentions(false);
					props.onClose();
				}
			}
		)
	);

	/** Set mention search results from parent. */
	function setMentionResults(friends: Friend[]) {
		setMentionFriends(friends);
		setMentionSelectedIndex(0);
		setShowMentions(friends.length > 0);
	}

	// Expose setMentionResults for parent to call via ref callback pattern
	if (props.mentionResultsRef) {
		props.mentionResultsRef(setMentionResults);
	}

	function focusInput() {
		// Small delay to let DOM update
		queueMicrotask(() => {
			textareaRef?.focus();
		});
	}

	function onInputKeydown(e: KeyboardEvent) {
		if (showMentions() && mentionFriends().length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setMentionSelectedIndex(
					Math.min(mentionSelectedIndex() + 1, mentionFriends().length - 1)
				);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setMentionSelectedIndex(Math.max(mentionSelectedIndex() - 1, 0));
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				const friend = mentionFriends()[mentionSelectedIndex()];
				if (friend) selectMention(friend);
				return;
			}
			if (e.key === "Escape") {
				setShowMentions(false);
				return;
			}
		}

		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			const textarea = e.target as HTMLTextAreaElement;
			const content = textarea.value.trim();
			if (!content) return;

			setSubmitting(true);
			const mentions = extractMentionIds(content, mentionFriends());

			props.onCreateComment(content, mentions, replyingTo() ?? undefined);

			textarea.value = "";
			setReplyingTo(null);
			setSubmitting(false);
		}
	}

	function onInputChange(e: Event) {
		const textarea = e.target as HTMLTextAreaElement;
		const value = textarea.value;
		const cursorPos = textarea.selectionStart || 0;
		const before = value.slice(0, cursorPos);
		const lastAt = before.lastIndexOf("@");

		if (lastAt !== -1) {
			const query = before.slice(lastAt + 1);
			if (!query.includes(" ")) {
				mentionStartPos = lastAt;
				props.onSearchFriends(query);
				return;
			}
		}

		setShowMentions(false);
	}

	function selectMention(friend: Friend) {
		if (!textareaRef) return;

		const before = textareaRef.value.slice(0, mentionStartPos);
		const after = textareaRef.value.slice(textareaRef.selectionStart || 0);
		const mention = `@${friend.name} `;
		textareaRef.value = before + mention + after;

		const newPos = before.length + mention.length;
		textareaRef.setSelectionRange(newPos, newPos);
		textareaRef.focus();
		setShowMentions(false);
	}

	function extractMentionIds(content: string, friends: Friend[]): string[] {
		const mentionRegex = /@(\w+)/g;
		const mentions: string[] = [];
		for (const match of content.matchAll(mentionRegex)) {
			const name = match[1];
			const friend = friends.find(
				(f) => f.name?.toLowerCase() === name.toLowerCase()
			);
			if (friend) mentions.push(friend.id);
		}
		return [...new Set(mentions)];
	}

	function renderThread(thread: CommentThread, depth: number) {
		const { comment, replies } = thread;
		const isOwn = () => props.currentUserId === comment.authorId;
		const authorName = () =>
			isOwn() ? "You" : comment.author.name || "Someone";

		return (
			<>
				<div
					class={`gloss-comment ${depth > 0 ? "gloss-comment-reply" : ""}`}
					style={{ "margin-left": `${Math.min(depth, 2) * 16}px` }}
				>
					<div class="gloss-comment-author">
						<span>
							{authorName()} {"\u00B7"} {formatRelativeTime(comment.createdAt)}
						</span>
						<span class="gloss-comment-actions">
							<Show when={depth < 2}>
								<button
									type="button"
									class="gloss-action-btn"
									onClick={() => {
										setReplyingTo(comment.id);
										focusInput();
									}}
								>
									Reply
								</button>
							</Show>
							<Show when={isOwn()}>
								<button
									type="button"
									class="gloss-action-btn gloss-delete"
									onClick={() => props.onDeleteComment(comment.id)}
								>
									Delete
								</button>
							</Show>
						</span>
					</div>
					<div
						class="gloss-comment-content"
						innerHTML={renderMarkdown(comment.content)}
					/>
				</div>
				<For each={replies}>{(r) => renderThread(r, depth + 1)}</For>
			</>
		);
	}

	return (
		<Show when={props.visible && props.highlight}>
			<div
				ref={panelRef}
				id="gloss-comment-panel"
				class="gloss-comment-panel-host"
			>
				<div class="gloss-panel">
					{/* Header */}
					<div class="gloss-panel-header">
						<span class="gloss-header-info">
							{props.isOwner
								? "You"
								: (props.highlight?.highlight.metadata?.userName as string) ||
									"Someone"}
							{props.highlight?.highlight.metadata?.createdAt
								? ` \u00B7 ${formatRelativeTime(
										props.highlight.highlight.metadata.createdAt as string
									)}`
								: ""}
						</span>
						<Show when={props.isOwner}>
							<button
								type="button"
								class="gloss-delete-highlight-btn"
								title="Delete highlight"
								onClick={() => {
									props.onDeleteHighlight();
									props.onSetVisible(false);
								}}
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M3 6h18" />
									<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
									<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
								</svg>
							</button>
						</Show>
					</div>

					{/* Comments list */}
					<div class="gloss-comments-list">
						<For each={buildCommentTree(props.comments)}>
							{(thread) => renderThread(thread, 0)}
						</For>
					</div>

					{/* Input area */}
					<div class="gloss-input-area">
						<Show when={replyingTo()}>
							<div class="gloss-reply-indicator">
								<span>Replying to comment</span>
								<button
									type="button"
									class="gloss-reply-cancel"
									onClick={() => setReplyingTo(null)}
								>
									{"\u00D7"}
								</button>
							</div>
						</Show>
						<textarea
							ref={textareaRef}
							placeholder={
								replyingTo() ? "Write a reply..." : "Write a note..."
							}
							rows="1"
							disabled={submitting()}
							onKeyDown={onInputKeydown}
							onInput={onInputChange}
						/>
						<Show when={showMentions() && mentionFriends().length > 0}>
							<div class="gloss-mention-dropdown">
								<For each={mentionFriends()}>
									{(f, i) => (
										<div
											class={`gloss-mention-item ${i() === mentionSelectedIndex() ? "selected" : ""}`}
											role="option"
											aria-selected={i() === mentionSelectedIndex()}
											onClick={() => selectMention(f)}
											onKeyDown={(e: KeyboardEvent) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
													selectMention(f);
												}
											}}
										>
											{f.name || "Unknown"}
										</div>
									)}
								</For>
							</div>
						</Show>
						<span class="gloss-hint">{"\u21B5"} to send</span>
					</div>
				</div>
			</div>
		</Show>
	);
}

// Re-export the setMentionResults type for content.ts
export type SetMentionResultsFn = (friends: Friend[]) => void;
