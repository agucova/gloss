/**
 * Shared utilities for comment UI components.
 * Used by both comment-panel.ts and margin-annotations.ts.
 */

import type { Friend, ServerComment } from "../utils/messages";

// ============================================================================
// Markdown rendering
// ============================================================================

/**
 * Escape HTML special characters.
 */
export function escapeHtml(text: string): string {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

/**
 * Simple markdown renderer for comments.
 * Supports: **bold**, *italic*, `code`, [links](url), @mentions
 */
export function renderMarkdown(text: string): string {
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

// ============================================================================
// Time formatting
// ============================================================================

/**
 * Format a timestamp as relative time.
 */
export function formatRelativeTime(dateString?: string): string {
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

// ============================================================================
// Mention handling
// ============================================================================

/** State for mention dropdown handling */
export interface MentionState {
	query: string;
	startPos: number;
	selectedIndex: number;
	friends: Friend[];
}

/**
 * Handle mention dropdown keyboard navigation.
 * Returns true if the event was handled.
 */
export function handleMentionKeydown(
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
 * Show the mention dropdown.
 */
export function showMentionDropdown(
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
export function hideMentionDropdown(dropdown: HTMLElement): void {
	dropdown.style.display = "none";
	dropdown.innerHTML = "";
}

/**
 * Update selection in mention dropdown.
 */
export function updateMentionSelection(
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
export function insertMention(
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
export function extractMentions(
	content: string,
	knownFriends: Friend[]
): string[] {
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

// ============================================================================
// Comment threading
// ============================================================================

export interface CommentThread {
	comment: ServerComment;
	replies: CommentThread[];
}

/**
 * Build a tree structure from a flat comments list.
 */
export function buildCommentTree(comments: ServerComment[]): CommentThread[] {
	const byId = new Map<string, CommentThread>();
	const roots: CommentThread[] = [];

	// First pass: create all nodes
	for (const comment of comments) {
		byId.set(comment.id, { comment, replies: [] });
	}

	// Second pass: build tree
	for (const comment of comments) {
		const node = byId.get(comment.id);
		if (!node) {
			continue;
		}
		if (comment.parentId && byId.has(comment.parentId)) {
			byId.get(comment.parentId)?.replies.push(node);
		} else {
			roots.push(node);
		}
	}

	// Sort by createdAt (oldest first)
	const sortByDate = (a: CommentThread, b: CommentThread) =>
		new Date(a.comment.createdAt).getTime() -
		new Date(b.comment.createdAt).getTime();

	roots.sort(sortByDate);
	for (const node of byId.values()) {
		node.replies.sort(sortByDate);
	}

	return roots;
}
