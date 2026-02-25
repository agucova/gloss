/**
 * Comment panel for viewing and adding comments on highlights.
 * Shows when clicking a highlight or a margin annotation.
 *
 * Uses FloatingController for positioning and GlossElement for dismiss handling.
 */

import type { ActiveHighlight } from "@gloss/anchoring";

import { css, html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

import type { Friend, ServerComment } from "../utils/messages";

import {
	type CommentThread,
	buildCommentTree,
	extractMentions,
	formatRelativeTime,
	renderMarkdown,
} from "./comment-utils";
import { FloatingController, getDefaultPlacement } from "./floating-controller";
import {
	GlossElement,
	glossBaseStyles,
	glossButtonStyles,
} from "./gloss-element";

export class GlossCommentPanel extends GlossElement {
	static properties = {
		highlight: { type: Object },
		element: { type: Object },
		isOwner: { type: Boolean },
		currentUserId: { type: String },
		comments: { type: Array },
		visible: { type: Boolean, reflect: true },
		_replyingTo: { type: String, state: true },
		_mentionFriends: { type: Array, state: true },
		_mentionSelectedIndex: { type: Number, state: true },
		_showMentions: { type: Boolean, state: true },
		_submitting: { type: Boolean, state: true },
	};

	static styles = [
		glossBaseStyles,
		glossButtonStyles,
		css`
			:host {
				position: fixed;
				z-index: 2147483647;
				pointer-events: none;
				display: block;
			}

			:host([visible]) {
				pointer-events: auto;
			}

			.panel {
				background: #ffffff;
				border: 1px solid rgba(0, 0, 0, 0.08);
				border-radius: 12px;
				box-shadow:
					0 4px 16px rgba(0, 0, 0, 0.12),
					0 1px 3px rgba(0, 0, 0, 0.08);
				width: 280px;
				max-height: 400px;
				display: flex;
				flex-direction: column;
				overflow: hidden;
				animation: fade-in 0.15s ease-out;
				font-family:
					"Satoshi",
					system-ui,
					-apple-system,
					sans-serif;
			}
			@media (prefers-color-scheme: dark) {
				.panel {
					background: #2a2a2a;
					border-color: rgba(255, 255, 255, 0.1);
					box-shadow:
						0 4px 16px rgba(0, 0, 0, 0.4),
						0 1px 3px rgba(0, 0, 0, 0.2);
				}
			}
			@keyframes fade-in {
				from {
					opacity: 0;
					transform: translateY(4px);
				}
				to {
					opacity: 1;
					transform: translateY(0);
				}
			}

			.header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				padding: 10px 12px;
				border-bottom: 1px solid rgba(0, 0, 0, 0.06);
				flex-shrink: 0;
			}
			@media (prefers-color-scheme: dark) {
				.header {
					border-bottom-color: rgba(255, 255, 255, 0.08);
				}
			}
			.header-info {
				font-size: 12px;
				color: #666666;
			}
			@media (prefers-color-scheme: dark) {
				.header-info {
					color: #999999;
				}
			}
			.delete-highlight-btn {
				padding: 4px;
				border-radius: 4px;
				color: #999999;
				background: none;
				border: none;
				cursor: pointer;
				display: flex;
				align-items: center;
			}
			.delete-highlight-btn:hover {
				color: #dc2626;
				background: rgba(220, 38, 38, 0.1);
			}

			.comments-list {
				overflow-y: auto;
				min-height: 0;
			}
			.comments-list:not(:empty) {
				flex: 1;
				padding: 8px 12px;
			}

			.comment {
				padding: 8px 0;
				border-bottom: 1px solid rgba(0, 0, 0, 0.04);
			}
			.comment:last-child {
				border-bottom: none;
			}
			@media (prefers-color-scheme: dark) {
				.comment {
					border-bottom-color: rgba(255, 255, 255, 0.06);
				}
			}

			.comment-reply {
				border-left: 2px solid rgba(0, 0, 0, 0.08);
				padding-left: 8px;
			}
			@media (prefers-color-scheme: dark) {
				.comment-reply {
					border-color: rgba(255, 255, 255, 0.1);
				}
			}

			.comment-author {
				display: flex;
				align-items: center;
				justify-content: space-between;
				font-size: 11px;
				color: #888888;
				margin-bottom: 4px;
			}
			@media (prefers-color-scheme: dark) {
				.comment-author {
					color: #777777;
				}
			}

			.comment-actions {
				display: inline-flex;
				gap: 4px;
				margin-left: auto;
				opacity: 0;
				transition: opacity 0.15s ease;
			}
			.comment:hover .comment-actions {
				opacity: 1;
			}

			.action-btn {
				background: none;
				border: none;
				color: #999999;
				font-size: 10px;
				cursor: pointer;
				padding: 2px 4px;
				border-radius: 3px;
				font-family: inherit;
			}
			.action-btn:hover {
				color: #333333;
				background: rgba(0, 0, 0, 0.05);
			}
			.action-btn.delete:hover {
				color: #dc2626;
				background: rgba(220, 38, 38, 0.1);
			}
			@media (prefers-color-scheme: dark) {
				.action-btn:hover {
					color: #dddddd;
					background: rgba(255, 255, 255, 0.1);
				}
			}

			.comment-content {
				font-size: 13px;
				line-height: 1.5;
				color: #1a1a1a;
				word-wrap: break-word;
			}
			@media (prefers-color-scheme: dark) {
				.comment-content {
					color: #e5e5e5;
				}
			}
			.comment-content :is(strong) {
				font-weight: 600;
			}
			.comment-content :is(em) {
				font-style: italic;
			}
			.comment-content :is(code) {
				font-family: ui-monospace, monospace;
				font-size: 12px;
				background: rgba(0, 0, 0, 0.06);
				padding: 1px 4px;
				border-radius: 3px;
			}
			@media (prefers-color-scheme: dark) {
				.comment-content :is(code) {
					background: rgba(255, 255, 255, 0.1);
				}
			}
			.comment-content :is(a) {
				color: #2563eb;
				text-decoration: underline;
				text-underline-offset: 2px;
			}
			@media (prefers-color-scheme: dark) {
				.comment-content :is(a) {
					color: #60a5fa;
				}
			}

			.input-area {
				position: relative;
				padding: 8px 12px 10px;
				border-top: 1px solid rgba(0, 0, 0, 0.06);
				flex-shrink: 0;
			}
			@media (prefers-color-scheme: dark) {
				.input-area {
					border-top-color: rgba(255, 255, 255, 0.08);
				}
			}

			.reply-indicator {
				display: flex;
				align-items: center;
				justify-content: space-between;
				padding: 4px 0 6px;
				font-size: 11px;
				color: #888888;
			}
			@media (prefers-color-scheme: dark) {
				.reply-indicator {
					color: #777777;
				}
			}
			.reply-cancel {
				background: none;
				border: none;
				color: #999999;
				font-size: 14px;
				cursor: pointer;
				padding: 0 2px;
				line-height: 1;
				border-radius: 3px;
			}
			.reply-cancel:hover {
				color: #666666;
				background: rgba(0, 0, 0, 0.05);
			}
			@media (prefers-color-scheme: dark) {
				.reply-cancel:hover {
					color: #cccccc;
					background: rgba(255, 255, 255, 0.1);
				}
			}

			textarea {
				width: 100%;
				padding: 8px 10px;
				font-size: 13px;
				font-family: inherit;
				border: 1px solid rgba(0, 0, 0, 0.12);
				border-radius: 8px;
				background: #ffffff;
				color: #1a1a1a;
				resize: none;
				min-height: 36px;
				max-height: 80px;
			}
			textarea:focus {
				outline: none;
				border-color: #1a1a1a;
			}
			textarea::placeholder {
				color: #999999;
			}
			@media (prefers-color-scheme: dark) {
				textarea {
					background: #1a1a1a;
					border-color: rgba(255, 255, 255, 0.12);
					color: #e5e5e5;
				}
				textarea:focus {
					border-color: #e5e5e5;
				}
				textarea::placeholder {
					color: #666666;
				}
			}

			.hint {
				position: absolute;
				right: 20px;
				bottom: 18px;
				font-size: 10px;
				color: #bbbbbb;
				pointer-events: none;
			}
			@media (prefers-color-scheme: dark) {
				.hint {
					color: #555555;
				}
			}

			.mention-dropdown {
				position: absolute;
				bottom: 100%;
				left: 12px;
				right: 12px;
				margin-bottom: 4px;
				background: #ffffff;
				border: 1px solid rgba(0, 0, 0, 0.1);
				border-radius: 8px;
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
				max-height: 160px;
				overflow-y: auto;
				z-index: 10;
			}
			@media (prefers-color-scheme: dark) {
				.mention-dropdown {
					background: #2a2a2a;
					border-color: rgba(255, 255, 255, 0.15);
				}
			}
			.mention-item {
				padding: 8px 12px;
				font-size: 13px;
				cursor: pointer;
				color: #1a1a1a;
			}
			.mention-item:hover,
			.mention-item.selected {
				background: rgba(0, 0, 0, 0.05);
			}
			@media (prefers-color-scheme: dark) {
				.mention-item {
					color: #e5e5e5;
				}
				.mention-item:hover,
				.mention-item.selected {
					background: rgba(255, 255, 255, 0.1);
				}
			}
		`,
	];

	// Public reactive properties
	declare highlight: ActiveHighlight | null;
	declare element: HTMLElement | null;
	declare isOwner: boolean;
	declare currentUserId: string;
	declare comments: ServerComment[];
	declare visible: boolean;

	// Internal reactive state
	declare _replyingTo: string | null;
	declare _mentionFriends: Friend[];
	declare _mentionSelectedIndex: number;
	declare _showMentions: boolean;
	declare _submitting: boolean;

	// Non-reactive mention tracking
	private _mentionStartPos = -1;

	constructor() {
		super();
		this.highlight = null;
		this.element = null;
		this.isOwner = false;
		this.currentUserId = "";
		this.comments = [];
		this.visible = false;
		this._replyingTo = null;
		this._mentionFriends = [];
		this._mentionSelectedIndex = 0;
		this._showMentions = false;
		this._submitting = false;
	}

	private _floating = new FloatingController(this, {
		placement: getDefaultPlacement(),
		offsetDistance: 16,
		viewportPadding: 16,
		enableFlip: true,
		fallbackPlacements: ["left", "bottom", "top"],
	});

	updated(changed: Map<string, unknown>): void {
		if (
			(changed.has("visible") || changed.has("element")) &&
			this.visible &&
			this.element
		) {
			this._floating.attach(this.element, this);
			this.setupDismissHandlers(() => {
				this.visible = false;
			});
		}
		if (
			changed.has("visible") &&
			!this.visible &&
			changed.get("visible") === true
		) {
			this._floating.detach();
			this._dismissCleanup?.();
			this._dismissCleanup = null;
			this._replyingTo = null;
			this._showMentions = false;
			this.dispatchEvent(
				new CustomEvent("gloss-panel-closed", {
					bubbles: true,
					composed: true,
				})
			);
		}
	}

	/** Set mention search results from parent. */
	setMentionResults(friends: Friend[]): void {
		this._mentionFriends = friends;
		this._mentionSelectedIndex = 0;
		this._showMentions = friends.length > 0;
	}

	render() {
		if (!this.visible || !this.highlight) return nothing;

		const highlightData = this.highlight.highlight;
		const highlighterName = this.isOwner
			? "You"
			: (highlightData.metadata?.userName as string) || "Someone";
		const createdAt = highlightData.metadata?.createdAt as string | undefined;
		const tree = buildCommentTree(this.comments);

		return html`
			<div class="panel">
				<div class="header">
					<span class="header-info">
						${highlighterName}${
							createdAt ? ` \u00B7 ${formatRelativeTime(createdAt)}` : ""
						}
					</span>
					${
						this.isOwner
							? html`
								<button
									class="delete-highlight-btn"
									title="Delete highlight"
									@click=${this._onDeleteHighlight}
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
										<path
											d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
										/>
										<path
											d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
										/>
									</svg>
								</button>
							`
							: nothing
					}
				</div>

				<div class="comments-list">
					${tree.map((thread) => this._renderThread(thread, 0))}
				</div>

				<div class="input-area">
					${
						this._replyingTo
							? html`
								<div class="reply-indicator">
									<span>Replying to comment</span>
									<button
										class="reply-cancel"
										@click=${() => {
											this._replyingTo = null;
										}}
									>
										\u00D7
									</button>
								</div>
							`
							: nothing
					}
					<textarea
						placeholder=${
							this._replyingTo ? "Write a reply..." : "Write a note..."
						}
						rows="1"
						?disabled=${this._submitting}
						@keydown=${this._onInputKeydown}
						@input=${this._onInputChange}
					></textarea>
					${
						this._showMentions && this._mentionFriends.length > 0
							? html`
								<div class="mention-dropdown">
									${this._mentionFriends.map(
										(f, i) => html`
											<div
												class="mention-item ${i === this._mentionSelectedIndex ? "selected" : ""}"
												@click=${() => this._selectMention(f)}
											>
												${f.name || "Unknown"}
											</div>
										`
									)}
								</div>
							`
							: nothing
					}
					<span class="hint">\u21B5 to send</span>
				</div>
			</div>
		`;
	}

	private _renderThread(
		thread: CommentThread,
		depth: number
	): ReturnType<typeof html> {
		const { comment, replies } = thread;
		const isOwn = this.currentUserId === comment.authorId;
		const authorName = isOwn ? "You" : comment.author.name || "Someone";

		return html`
			<div
				class="comment ${depth > 0 ? "comment-reply" : ""}"
				style="margin-left: ${Math.min(depth, 2) * 16}px"
			>
				<div class="comment-author">
					<span
						>${authorName} \u00B7
						${formatRelativeTime(comment.createdAt)}</span
					>
					<span class="comment-actions">
						${
							depth < 2
								? html`<button
									class="action-btn"
									@click=${() => {
										this._replyingTo = comment.id;
										this._focusInput();
									}}
								>
									Reply
								</button>`
								: nothing
						}
						${
							isOwn
								? html`<button
									class="action-btn delete"
									@click=${() => this._onDeleteComment(comment.id)}
								>
									Delete
								</button>`
								: nothing
						}
					</span>
				</div>
				<div class="comment-content">
					${unsafeHTML(renderMarkdown(comment.content))}
				</div>
			</div>
			${replies.map((r) => this._renderThread(r, depth + 1))}
		`;
	}

	private async _onInputKeydown(e: KeyboardEvent): Promise<void> {
		if (this._showMentions && this._mentionFriends.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				this._mentionSelectedIndex = Math.min(
					this._mentionSelectedIndex + 1,
					this._mentionFriends.length - 1
				);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				this._mentionSelectedIndex = Math.max(
					this._mentionSelectedIndex - 1,
					0
				);
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				const friend = this._mentionFriends[this._mentionSelectedIndex];
				if (friend) this._selectMention(friend);
				return;
			}
			if (e.key === "Escape") {
				this._showMentions = false;
				return;
			}
		}

		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			const textarea = e.target as HTMLTextAreaElement;
			const content = textarea.value.trim();
			if (!content) return;

			this._submitting = true;
			const mentions = extractMentions(content, this._mentionFriends);

			this.dispatchEvent(
				new CustomEvent("gloss-create-comment", {
					detail: {
						content,
						mentions,
						parentId: this._replyingTo ?? undefined,
					},
					bubbles: true,
					composed: true,
				})
			);

			textarea.value = "";
			this._replyingTo = null;
			this._submitting = false;
		}
	}

	private _onInputChange(e: Event): void {
		const textarea = e.target as HTMLTextAreaElement;
		const value = textarea.value;
		const cursorPos = textarea.selectionStart || 0;
		const before = value.slice(0, cursorPos);
		const lastAt = before.lastIndexOf("@");

		if (lastAt !== -1) {
			const query = before.slice(lastAt + 1);
			if (!query.includes(" ")) {
				this._mentionStartPos = lastAt;
				this.dispatchEvent(
					new CustomEvent("gloss-search-friends", {
						detail: { query },
						bubbles: true,
						composed: true,
					})
				);
				return;
			}
		}

		this._showMentions = false;
	}

	private _selectMention(friend: Friend): void {
		const textarea = this.shadowRoot!.querySelector(
			"textarea"
		) as HTMLTextAreaElement;
		if (!textarea) return;

		const before = textarea.value.slice(0, this._mentionStartPos);
		const after = textarea.value.slice(textarea.selectionStart || 0);
		const mention = `@${friend.name} `;
		textarea.value = before + mention + after;

		const newPos = before.length + mention.length;
		textarea.setSelectionRange(newPos, newPos);
		textarea.focus();
		this._showMentions = false;
	}

	private _focusInput(): void {
		this.updateComplete.then(() => {
			const textarea = this.shadowRoot!.querySelector(
				"textarea"
			) as HTMLTextAreaElement;
			textarea?.focus();
		});
	}

	private _onDeleteHighlight(): void {
		this.dispatchEvent(
			new CustomEvent("gloss-delete-highlight", {
				bubbles: true,
				composed: true,
			})
		);
		this.visible = false;
	}

	private _onDeleteComment(id: string): void {
		this.dispatchEvent(
			new CustomEvent("gloss-delete-comment", {
				detail: { commentId: id },
				bubbles: true,
				composed: true,
			})
		);
	}
}

if (!window.customElements.get("gloss-comment-panel")) {
	window.customElements.define("gloss-comment-panel", GlossCommentPanel);
}
