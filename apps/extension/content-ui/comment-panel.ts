/**
 * Comment panel for viewing and adding comments on highlights.
 * Replaces the highlight popover with a marginalia-style panel.
 */

import type { ActiveHighlight, Highlight } from "@gloss/anchoring";
import type { Friend, ServerComment } from "../utils/messages";
import {
	createPopoverContainer,
	hidePopover,
	setupDismissHandlers,
} from "./popover";

export interface CommentPanelOptions {
	/** The highlight element that was clicked */
	element: HTMLElement;
	/** The highlight data */
	highlight: ActiveHighlight;
	/** Whether current user owns this highlight */
	isOwner: boolean;
	/** Current user ID (if authenticated) */
	currentUserId?: string;
	/** Comments for this highlight */
	comments: ServerComment[];
	/** Callback to load comments */
	onLoadComments: () => Promise<ServerComment[]>;
	/** Callback to create a comment */
	onCreateComment: (
		content: string,
		mentions: string[]
	) => Promise<ServerComment | null>;
	/** Callback to delete a comment */
	onDeleteComment: (id: string) => Promise<boolean>;
	/** Callback to delete the highlight */
	onDeleteHighlight?: () => void;
	/** Callback to search friends for @mentions */
	onSearchFriends: (query: string) => Promise<Friend[]>;
}

const PANEL_ID = "gloss-comment-panel";

let currentHost: HTMLElement | null = null;
let currentPopover: HTMLElement | null = null;
let cleanupDismiss: (() => void) | null = null;

/** Helper to get highlight data from ActiveHighlight */
function getHighlightData(active: ActiveHighlight): Highlight {
	return active.highlight;
}

/** Helper to get metadata value safely */
function getMetadata(active: ActiveHighlight, key: string): string | undefined {
	const data = getHighlightData(active);
	return data.metadata?.[key] as string | undefined;
}

/**
 * Show the comment panel anchored to the highlight.
 */
export function showCommentPanel(options: CommentPanelOptions): void {
	console.log("[Gloss] showCommentPanel called");
	const {
		element,
		highlight,
		isOwner,
		currentUserId,
		comments,
		onLoadComments,
		onCreateComment,
		onDeleteComment,
		onDeleteHighlight,
		onSearchFriends,
	} = options;

	console.log("[Gloss] Creating panel for highlight:", highlight.highlight.id);

	// Hide existing panel first
	hideCommentPanel();

	// Create container with shadow DOM
	const { host, popover } = createPopoverContainer(PANEL_ID);
	currentHost = host;
	currentPopover = popover;

	// Override popover class for panel styling
	popover.classList.add("gloss-comment-panel");

	// Build panel content
	const container = document.createElement("div");
	container.className = "gloss-panel-container";

	// Header with highlight info and delete button
	const header = buildHeader(highlight, isOwner, onDeleteHighlight);
	container.appendChild(header);

	// Comments list
	const commentsList = document.createElement("div");
	commentsList.className = "gloss-comments-list";
	buildCommentsList(commentsList, comments, currentUserId, onDeleteComment);
	container.appendChild(commentsList);

	// Input area
	const inputArea = buildInputArea(
		onCreateComment,
		onSearchFriends,
		async (_newComment) => {
			// Refresh comments list after adding
			const updatedComments = await onLoadComments();
			buildCommentsList(
				commentsList,
				updatedComments,
				currentUserId,
				onDeleteComment
			);
		}
	);
	container.appendChild(inputArea);

	popover.appendChild(container);

	// Position the panel to the right of the highlight
	positionPanel(popover, element);

	// Set up dismiss handlers
	cleanupDismiss = setupDismissHandlers(host, popover, hideCommentPanel);

	console.log("[Gloss] Comment panel created and positioned", {
		left: popover.style.left,
		top: popover.style.top,
		width: popover.style.width,
	});
}

/**
 * Hide and remove the comment panel.
 */
export function hideCommentPanel(): void {
	if (cleanupDismiss) {
		cleanupDismiss();
		cleanupDismiss = null;
	}

	if (currentHost && currentPopover) {
		hidePopover(currentHost, currentPopover);
		currentHost = null;
		currentPopover = null;
	}
}

/**
 * Check if the comment panel is currently visible.
 */
export function isCommentPanelVisible(): boolean {
	return currentHost !== null;
}

/**
 * Position the panel to the right of the highlight.
 */
function positionPanel(
	panel: HTMLElement,
	highlightElement: HTMLElement
): void {
	const highlightRect = highlightElement.getBoundingClientRect();
	const panelWidth = 280;
	const offset = 16;
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;

	// Prefer right side
	let left = highlightRect.right + offset;

	// Fall back to left if not enough space on right
	if (left + panelWidth > viewportWidth - 16) {
		left = highlightRect.left - panelWidth - offset;
	}

	// If still no space, center below
	if (left < 16) {
		left = Math.max(16, (viewportWidth - panelWidth) / 2);
	}

	// Vertical: align with highlight center, constrain to viewport
	let top = highlightRect.top;
	const panelHeight = 300; // Approximate
	top = Math.max(16, Math.min(top, viewportHeight - panelHeight - 16));

	panel.style.left = `${left}px`;
	panel.style.top = `${top}px`;
	panel.style.width = `${panelWidth}px`;
}

/**
 * Build the header section with highlighter info and delete button.
 */
function buildHeader(
	highlight: ActiveHighlight,
	isOwner: boolean,
	onDeleteHighlight?: () => void
): HTMLElement {
	const header = document.createElement("div");
	header.className = "gloss-panel-header";

	// Highlighter info
	const highlighterName = getMetadata(highlight, "userName") || "You";
	const createdAt = getMetadata(highlight, "createdAt");

	const info = document.createElement("span");
	info.className = "gloss-panel-info";
	info.textContent = isOwner ? "" : highlighterName;
	if (createdAt) {
		const time = formatRelativeTime(createdAt);
		if (info.textContent) {
			info.textContent += ` · ${time}`;
		}
	}
	header.appendChild(info);

	// Delete button (only for owner)
	if (isOwner && onDeleteHighlight) {
		const deleteBtn = document.createElement("button");
		deleteBtn.className = "gloss-btn gloss-btn-ghost gloss-btn-icon";
		deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
		deleteBtn.title = "Delete highlight";
		deleteBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			onDeleteHighlight();
			hideCommentPanel();
		});
		header.appendChild(deleteBtn);
	}

	return header;
}

/**
 * Build the comments list.
 */
function buildCommentsList(
	container: HTMLElement,
	comments: ServerComment[],
	currentUserId?: string,
	onDeleteComment?: (id: string) => Promise<boolean>
): void {
	container.innerHTML = "";

	if (comments.length === 0) {
		return;
	}

	// Sort by createdAt ascending (oldest first)
	const sorted = [...comments].sort(
		(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
	);

	for (const comment of sorted) {
		const commentEl = buildComment(comment, currentUserId, onDeleteComment);
		container.appendChild(commentEl);
	}
}

/**
 * Build a single comment element.
 */
function buildComment(
	comment: ServerComment,
	currentUserId?: string,
	onDeleteComment?: (id: string) => Promise<boolean>
): HTMLElement {
	const el = document.createElement("div");
	el.className = "gloss-comment";

	// Author line
	const authorLine = document.createElement("div");
	authorLine.className = "gloss-comment-author";

	const isOwnComment = currentUserId === comment.authorId;
	const authorName = isOwnComment ? "You" : comment.author.name || "Someone";
	const time = formatRelativeTime(comment.createdAt);

	const authorSpan = document.createElement("span");
	authorSpan.textContent = `${authorName} · ${time}`;
	authorLine.appendChild(authorSpan);

	// Delete button for own comments
	if (isOwnComment && onDeleteComment) {
		const deleteBtn = document.createElement("button");
		deleteBtn.className = "gloss-comment-delete";
		deleteBtn.textContent = "Delete";
		deleteBtn.addEventListener("click", async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const success = await onDeleteComment(comment.id);
			if (success) {
				el.remove();
			}
		});
		authorLine.appendChild(deleteBtn);
	}

	el.appendChild(authorLine);

	// Content with markdown rendering
	const content = document.createElement("div");
	content.className = "gloss-comment-content";
	content.innerHTML = renderMarkdown(comment.content);
	el.appendChild(content);

	return el;
}

/** State for mention dropdown handling */
interface MentionState {
	query: string;
	startPos: number;
	selectedIndex: number;
	friends: Friend[];
}

/**
 * Handle mention dropdown keyboard navigation.
 * Returns true if the event was handled.
 */
function handleMentionKeydown(
	e: KeyboardEvent,
	state: MentionState,
	input: HTMLTextAreaElement,
	dropdown: HTMLElement
): boolean {
	if (dropdown.style.display === "none" || state.friends.length === 0) {
		return false;
	}

	switch (e.key) {
		case "ArrowDown":
			e.preventDefault();
			state.selectedIndex = Math.min(
				state.selectedIndex + 1,
				state.friends.length - 1
			);
			updateMentionSelection(dropdown, state.selectedIndex);
			return true;

		case "ArrowUp":
			e.preventDefault();
			state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
			updateMentionSelection(dropdown, state.selectedIndex);
			return true;

		case "Enter":
		case "Tab": {
			e.preventDefault();
			const friend = state.friends[state.selectedIndex];
			if (friend) {
				insertMention(input, state.startPos, friend);
				hideMentionDropdown(dropdown);
			}
			return true;
		}

		case "Escape":
			hideMentionDropdown(dropdown);
			return true;

		default:
			return false;
	}
}

/**
 * Build the input area for adding comments.
 */
function buildInputArea(
	onCreateComment: (
		content: string,
		mentions: string[]
	) => Promise<ServerComment | null>,
	onSearchFriends: (query: string) => Promise<Friend[]>,
	onCommentAdded: (comment: ServerComment) => void
): HTMLElement {
	const container = document.createElement("div");
	container.className = "gloss-comment-input-container";

	const input = document.createElement("textarea");
	input.className = "gloss-comment-input";
	input.placeholder = "Write a note...";
	input.rows = 1;

	// Mention dropdown
	const mentionDropdown = document.createElement("div");
	mentionDropdown.className = "gloss-mention-dropdown";
	mentionDropdown.style.display = "none";

	const mentionState: MentionState = {
		query: "",
		startPos: -1,
		selectedIndex: 0,
		friends: [],
	};

	// Handle input for @mention detection
	input.addEventListener("input", async () => {
		const value = input.value;
		const cursorPos = input.selectionStart || 0;

		// Find @ symbol before cursor
		const textBeforeCursor = value.slice(0, cursorPos);
		const lastAtIndex = textBeforeCursor.lastIndexOf("@");

		if (lastAtIndex !== -1) {
			const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
			// Check if we're in a mention (no spaces after @)
			if (!textAfterAt.includes(" ")) {
				mentionState.query = textAfterAt;
				mentionState.startPos = lastAtIndex;

				// Search friends
				mentionState.friends = await onSearchFriends(mentionState.query);
				mentionState.selectedIndex = 0;

				if (mentionState.friends.length > 0) {
					showMentionDropdown(
						mentionDropdown,
						mentionState.friends,
						mentionState.selectedIndex,
						(friend) => {
							insertMention(input, mentionState.startPos, friend);
							hideMentionDropdown(mentionDropdown);
						}
					);
				} else {
					hideMentionDropdown(mentionDropdown);
				}
				return;
			}
		}

		hideMentionDropdown(mentionDropdown);
	});

	// Handle keyboard navigation
	input.addEventListener("keydown", async (e) => {
		// Check if mention dropdown handled the event
		if (handleMentionKeydown(e, mentionState, input, mentionDropdown)) {
			return;
		}

		// Submit on Enter (without Shift)
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			const content = input.value.trim();
			if (!content) {
				return;
			}

			// Extract mentions from content
			const mentions = extractMentions(content, mentionState.friends);

			// Disable input while submitting
			input.disabled = true;

			const newComment = await onCreateComment(content, mentions);

			input.disabled = false;

			if (newComment) {
				input.value = "";
				onCommentAdded(newComment);
			}
		}
	});

	container.appendChild(input);
	container.appendChild(mentionDropdown);

	// Submit hint
	const hint = document.createElement("span");
	hint.className = "gloss-input-hint";
	hint.textContent = "↵ to send";
	container.appendChild(hint);

	return container;
}

/**
 * Show the mention dropdown.
 */
function showMentionDropdown(
	dropdown: HTMLElement,
	friends: Friend[],
	selectedIndex: number,
	onSelect: (friend: Friend) => void
): void {
	dropdown.innerHTML = "";
	dropdown.style.display = "block";

	for (let i = 0; i < friends.length; i++) {
		const friend = friends[i];
		const item = document.createElement("div");
		item.className = `gloss-mention-item${i === selectedIndex ? " selected" : ""}`;
		item.textContent = friend.name || "Unknown";
		item.addEventListener("click", () => onSelect(friend));
		dropdown.appendChild(item);
	}
}

/**
 * Hide the mention dropdown.
 */
function hideMentionDropdown(dropdown: HTMLElement): void {
	dropdown.style.display = "none";
	dropdown.innerHTML = "";
}

/**
 * Update selection in mention dropdown.
 */
function updateMentionSelection(
	dropdown: HTMLElement,
	selectedIndex: number
): void {
	const items = dropdown.querySelectorAll(".gloss-mention-item");
	items.forEach((item, i) => {
		item.classList.toggle("selected", i === selectedIndex);
	});
}

/**
 * Insert a mention into the input.
 */
function insertMention(
	input: HTMLTextAreaElement,
	startPos: number,
	friend: Friend
): void {
	const before = input.value.slice(0, startPos);
	const after = input.value.slice(input.selectionStart || 0);
	const mention = `@${friend.name} `;

	input.value = before + mention + after;
	const newPos = before.length + mention.length;
	input.setSelectionRange(newPos, newPos);
	input.focus();
}

/**
 * Extract mention user IDs from content.
 */
function extractMentions(content: string, knownFriends: Friend[]): string[] {
	const mentionRegex = /@(\w+)/g;
	const mentions: string[] = [];

	for (const match of content.matchAll(mentionRegex)) {
		const name = match[1];
		const friend = knownFriends.find(
			(f) => f.name?.toLowerCase() === name.toLowerCase()
		);
		if (friend) {
			mentions.push(friend.id);
		}
	}

	return [...new Set(mentions)];
}

/**
 * Simple markdown renderer for comments.
 * Supports: **bold**, *italic*, `code`, [links](url), @mentions
 */
function renderMarkdown(text: string): string {
	let html = escapeHtml(text);

	// Bold: **text**
	html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

	// Italic: *text*
	html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

	// Code: `text`
	html = html.replace(/`(.+?)`/g, "<code>$1</code>");

	// Links: [text](url)
	html = html.replace(
		/\[(.+?)\]\((.+?)\)/g,
		'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
	);

	// @mentions
	html = html.replace(/@(\w+)/g, '<span class="gloss-mention">@$1</span>');

	// Line breaks
	html = html.replace(/\n/g, "<br>");

	return html;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

/**
 * Format a timestamp as relative time.
 */
function formatRelativeTime(dateString?: string): string {
	if (!dateString) {
		return "";
	}

	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSeconds < 60) {
		return "just now";
	}
	if (diffMinutes < 60) {
		return `${diffMinutes}m ago`;
	}
	if (diffHours < 24) {
		return `${diffHours}h ago`;
	}
	if (diffDays < 30) {
		return `${diffDays}d ago`;
	}

	return date.toLocaleDateString();
}
