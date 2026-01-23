/**
 * Margin annotations system for displaying comments alongside highlights.
 * Renders like marginalia in books - aligned with highlights in the right margin.
 *
 * Uses Floating UI for robust positioning that handles all scroll scenarios.
 */

import type { HighlightManager } from "@gloss/anchoring";
import type {
	Friend,
	PageCommentSummary,
	ServerComment,
} from "../utils/messages";
import {
	getDefaultPlacement,
	mountFloatingAnnotation,
} from "./floating-annotation";
import { injectStyles } from "./styles";

export interface MarginAnnotationsOptions {
	/** Highlight manager for accessing highlight elements */
	manager: HighlightManager;
	/** Comment summary data */
	summary: PageCommentSummary;
	/** Callback when annotation is clicked (fallback for dots mode) */
	onAnnotationClick: (highlightId: string, element: HTMLElement) => void;
	/** Current user ID for showing delete buttons on own comments */
	currentUserId?: string;
	/** Callback to create a comment */
	onCreateComment?: (
		highlightId: string,
		content: string,
		mentions: string[],
		parentId?: string
	) => Promise<ServerComment | null>;
	/** Callback to delete a comment */
	onDeleteComment?: (commentId: string) => Promise<boolean>;
	/** Callback to search friends for @mentions */
	onSearchFriends?: (query: string) => Promise<Friend[]>;
}

export interface HoverPillOptions {
	/** The highlight element being hovered */
	highlightElement: HTMLElement;
	/** Highlight ID */
	highlightId: string;
	/** Number of comments on this highlight */
	commentCount: number;
	/** Callback when pill is clicked */
	onClick: () => void;
}

interface PositionedAnnotation {
	highlightId: string;
	comments: ServerComment[];
	top: number;
	element: HTMLElement;
}

const ANNOTATIONS_ID = "gloss-margin-annotations";
const HOVER_PILL_ID = "gloss-hover-pill";
const MIN_MARGIN_FULL = 200; // Full annotation display
const MIN_MARGIN_COMPACT = 120; // Compact mode
const ANNOTATION_MAX_WIDTH = 180;
const ANNOTATION_SPACING = 8;
const VIEWPORT_PADDING = 8;
const ANNOTATION_OFFSET = 24; // Distance from highlight to annotation

let currentHost: HTMLElement | null = null;
let annotationsContainer: HTMLElement | null = null;
let positionedAnnotations: PositionedAnnotation[] = [];
let resizeObserver: ResizeObserver | null = null;
let currentOptions: MarginAnnotationsOptions | null = null;
let marginMode: "full" | "compact" | "dots" = "full";

// Floating UI cleanup functions (autoUpdate returns cleanup functions)
const floatingCleanups = new Map<string, () => void>();

// Expanded annotation state (using let since these are reassigned in functions below)
let expandedHighlightId: string | null = null;
let expandedElement: HTMLElement | null = null;
let replyingToId: string | null = null;
let knownFriends: Friend[] = [];

// Hover pill state
let hoverPillElement: HTMLElement | null = null;
let currentHoverHighlightId: string | null = null;
let hoverPillHighlightElement: HTMLElement | null = null;
let hoverPillFloatingCleanup: (() => void) | null = null;
let hoverPillIntersectionObserver: IntersectionObserver | null = null;

/**
 * Show margin annotations for all highlights with comments.
 */
export function showMarginAnnotations(options: MarginAnnotationsOptions): void {
	currentOptions = options;
	const { summary } = options;

	// Don't show if no comments
	if (summary.highlightComments.length === 0) {
		hideMarginAnnotations();
		return;
	}

	// Clean up existing
	hideMarginAnnotations();

	// Detect margin mode based on available space
	marginMode = detectMarginMode();

	// Create host with shadow DOM
	const host = document.createElement("div");
	host.id = ANNOTATIONS_ID;
	host.style.cssText =
		"position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 2147483645; pointer-events: none;";

	const shadowRoot = host.attachShadow({ mode: "closed" });
	injectStyles(shadowRoot);

	// Add annotation-specific styles
	const annotationStyles = document.createElement("style");
	annotationStyles.textContent = ANNOTATION_STYLES;
	shadowRoot.appendChild(annotationStyles);

	// Create annotations container
	const container = document.createElement("div");
	container.className = "gloss-annotations-container";
	shadowRoot.appendChild(container);

	document.body.appendChild(host);
	currentHost = host;
	annotationsContainer = container;

	// Build and position annotations
	// Floating UI handles scroll/resize automatically via autoUpdate
	// and hides annotations when highlights are out of view via hide middleware
	buildAnnotations(options);

	// Set up resize observer for mode changes only
	setupResizeObserver();
}

/**
 * Hide and remove all margin annotations.
 */
export function hideMarginAnnotations(): void {
	// Clean up Floating UI positioning
	cleanupFloatingPositions();

	// Clean up resize observer
	if (resizeObserver) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}

	if (currentHost) {
		currentHost.remove();
		currentHost = null;
		annotationsContainer = null;
	}

	positionedAnnotations = [];
	currentOptions = null;
}

/**
 * Clean up all Floating UI position tracking.
 */
function cleanupFloatingPositions(): void {
	for (const cleanup of floatingCleanups.values()) {
		cleanup();
	}
	floatingCleanups.clear();
}

/**
 * Check if annotations are currently visible.
 */
export function areMarginAnnotationsVisible(): boolean {
	return currentHost !== null;
}

/**
 * Update annotations (e.g., after comments change).
 */
export function updateMarginAnnotations(summary: PageCommentSummary): void {
	if (!(currentOptions && annotationsContainer)) {
		return;
	}

	// Clean up existing Floating UI positions before rebuilding
	cleanupFloatingPositions();

	currentOptions = { ...currentOptions, summary };
	buildAnnotations(currentOptions);
}

/**
 * Show a hover pill for a specific highlight.
 * Uses Floating UI for robust positioning across all scroll scenarios.
 */
export function showHoverPill(options: HoverPillOptions): void {
	const { highlightElement, highlightId, commentCount, onClick } = options;

	// Don't show if annotations are already visible (they show the pills already)
	if (areMarginAnnotationsVisible()) {
		return;
	}

	// Don't show if already showing for this highlight
	if (currentHoverHighlightId === highlightId) {
		return;
	}

	// Hide existing hover pill
	hideHoverPill();

	currentHoverHighlightId = highlightId;
	hoverPillHighlightElement = highlightElement;

	// Create pill with aggressive style isolation (no shadow DOM)
	const pill = document.createElement("div");
	pill.id = HOVER_PILL_ID;
	pill.dataset.glossHoverPill = "true";
	pill.style.cssText = buildHoverPillStyles();
	pill.innerHTML = buildHoverPillContent(commentCount);

	// Append to body (Floating UI will position it)
	document.body.appendChild(pill);

	// Store reference
	hoverPillElement = pill;

	// Set up event handlers
	setupHoverPillEventHandlers(pill, onClick);

	// Use IntersectionObserver to hide when highlight leaves viewport
	setupHoverPillVisibilityObserver(highlightElement);

	// Use Floating UI for positioning (handles all scroll scenarios automatically)
	hoverPillFloatingCleanup = mountFloatingAnnotation(highlightElement, pill, {
		placement: getDefaultPlacement(),
		offsetDistance: ANNOTATION_OFFSET,
		viewportPadding: VIEWPORT_PADDING,
		enableFlip: true,
		fallbackPlacements: ["left", "bottom", "top"],
	});
}

/**
 * Build inline styles for the hover pill with aggressive style isolation.
 * Uses `all: initial` and `!important` to override any page styles.
 * Position is set by Floating UI, so we just set position: fixed.
 */
function buildHoverPillStyles(): string {
	// Check for dark mode preference
	const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

	return `
		all: initial !important;
		position: fixed !important;
		z-index: 2147483645 !important;
		display: flex !important;
		align-items: center !important;
		gap: 4px !important;
		padding: 6px 10px !important;
		border: 1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} !important;
		border-radius: 16px !important;
		background: ${isDark ? "rgba(38,38,38,0.98)" : "rgba(255,255,255,0.98)"} !important;
		backdrop-filter: blur(8px) !important;
		-webkit-backdrop-filter: blur(8px) !important;
		cursor: pointer !important;
		font-family: system-ui, -apple-system, sans-serif !important;
		font-size: 13px !important;
		font-weight: 600 !important;
		color: ${isDark ? "#e5e5e5" : "#1a1a1a"} !important;
		box-shadow: ${isDark ? "0 2px 8px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)"} !important;
		pointer-events: auto !important;
		box-sizing: border-box !important;
		line-height: 1 !important;
		transition: box-shadow 0.15s ease, transform 0.15s ease !important;
	`
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Build the inner HTML content for the hover pill.
 */
function buildHoverPillContent(commentCount: number): string {
	const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	const iconColor = isDark ? "#fbbf24" : "#f59e0b";

	return `
		<span style="all: initial !important; display: flex !important; align-items: center !important; justify-content: center !important; color: ${iconColor} !important;">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block !important;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
		</span>
		<span style="all: initial !important; font-size: 13px !important; font-weight: 600 !important; color: ${isDark ? "#e5e5e5" : "#1a1a1a"} !important; min-width: 8px !important; text-align: center !important; font-family: system-ui, -apple-system, sans-serif !important;">${commentCount}</span>
	`;
}

/**
 * Set up click and hover event handlers for the pill.
 */
function setupHoverPillEventHandlers(
	pill: HTMLElement,
	onClick: () => void
): void {
	const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

	pill.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		hideHoverPill();
		onClick();
	});

	// Hover effects
	pill.addEventListener("mouseenter", () => {
		pill.style.boxShadow = isDark
			? "0 4px 12px rgba(0,0,0,0.4) !important"
			: "0 4px 12px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.06) !important";
		pill.style.transform = "translateX(-2px) !important";
	});

	pill.addEventListener("mouseleave", () => {
		pill.style.boxShadow = isDark
			? "0 2px 8px rgba(0,0,0,0.3) !important"
			: "0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04) !important";
		pill.style.transform = "none !important";
	});
}

/**
 * Set up IntersectionObserver to hide the pill when highlight leaves viewport.
 */
function setupHoverPillVisibilityObserver(highlightElement: HTMLElement): void {
	hoverPillIntersectionObserver = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) {
					hideHoverPill();
				}
			}
		},
		{ threshold: 0 }
	);

	hoverPillIntersectionObserver.observe(highlightElement);
}

/**
 * Hide the hover pill and clean up all listeners.
 */
export function hideHoverPill(): void {
	// Clean up Floating UI positioning
	if (hoverPillFloatingCleanup) {
		hoverPillFloatingCleanup();
		hoverPillFloatingCleanup = null;
	}

	// Clean up intersection observer
	if (hoverPillIntersectionObserver) {
		hoverPillIntersectionObserver.disconnect();
		hoverPillIntersectionObserver = null;
	}

	// Remove pill from DOM
	if (hoverPillElement) {
		hoverPillElement.remove();
		hoverPillElement = null;
		currentHoverHighlightId = null;
		hoverPillHighlightElement = null;
	}
}

/**
 * Check if hover pill is visible for a specific highlight.
 */
export function isHoverPillVisibleFor(highlightId: string): boolean {
	return currentHoverHighlightId === highlightId;
}

/**
 * Detect available margin space and determine display mode.
 */
function detectMarginMode(): "full" | "compact" | "dots" {
	const viewportWidth = window.innerWidth;

	// Find the main content container
	const contentWidth = estimateContentWidth();
	const rightMargin = viewportWidth - contentWidth - VIEWPORT_PADDING;

	if (rightMargin >= MIN_MARGIN_FULL) {
		return "full";
	}
	if (rightMargin >= MIN_MARGIN_COMPACT) {
		return "compact";
	}
	return "dots";
}

/**
 * Estimate the width of the main content area.
 */
function estimateContentWidth(): number {
	// Try common content selectors
	const contentSelectors = [
		"article",
		"main",
		".content",
		".article",
		".post",
		".entry-content",
		".prose",
		'[role="main"]',
	];

	for (const selector of contentSelectors) {
		const el = document.querySelector(selector);
		if (el) {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.width < window.innerWidth * 0.9) {
				return rect.right;
			}
		}
	}

	// Fallback: estimate from body width
	const bodyStyle = getComputedStyle(document.body);
	const bodyWidth =
		document.body.offsetWidth -
		Number.parseFloat(bodyStyle.paddingLeft) -
		Number.parseFloat(bodyStyle.paddingRight);

	// If body is narrow, use it; otherwise estimate 70% of viewport
	if (bodyWidth < window.innerWidth * 0.8) {
		return bodyWidth + Number.parseFloat(bodyStyle.paddingLeft);
	}

	return window.innerWidth * 0.7;
}

/**
 * Build annotation elements for all highlights with comments.
 */
function buildAnnotations(options: MarginAnnotationsOptions): void {
	if (!annotationsContainer) {
		return;
	}

	const { manager, summary, onAnnotationClick } = options;

	// Clear existing annotations
	annotationsContainer.innerHTML = "";
	positionedAnnotations = [];

	// Get positions for all highlights with comments
	const annotationData: Array<{
		highlightId: string;
		comments: ServerComment[];
		top: number;
		highlightElement: HTMLElement;
	}> = [];

	for (const highlightComment of summary.highlightComments) {
		const active = manager.get(highlightComment.highlightId);
		if (!active || active.elements.length === 0) {
			continue;
		}

		// Get the first element's position
		const firstElement = active.elements[0];
		const rect = firstElement.getBoundingClientRect();

		annotationData.push({
			highlightId: highlightComment.highlightId,
			comments: highlightComment.comments,
			top: rect.top + window.scrollY,
			highlightElement: firstElement,
		});
	}

	// Sort by vertical position
	annotationData.sort((a, b) => a.top - b.top);

	// Build annotations based on mode
	if (marginMode === "dots") {
		buildDotAnnotations(annotationData, onAnnotationClick);
	} else {
		buildTextAnnotations(annotationData, onAnnotationClick);
	}
}

/**
 * Build full/compact text annotations using Floating UI for positioning.
 */
function buildTextAnnotations(
	annotationData: Array<{
		highlightId: string;
		comments: ServerComment[];
		top: number;
		highlightElement: HTMLElement;
	}>,
	_onAnnotationClick: (highlightId: string, element: HTMLElement) => void
): void {
	if (!annotationsContainer) {
		return;
	}

	const annotationWidth = marginMode === "compact" ? 140 : ANNOTATION_MAX_WIDTH;
	const placement = getDefaultPlacement();

	for (const data of annotationData) {
		// Build annotation element
		const annotation = buildAnnotationElement(
			data.comments,
			marginMode === "compact"
		);
		annotation.className = `gloss-annotation${marginMode === "compact" ? " compact" : ""}`;
		annotation.style.cssText = `
			position: fixed;
			width: ${annotationWidth}px;
			pointer-events: auto;
		`;

		annotation.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			// In full/compact mode, expand in place to show threaded comments
			expandAnnotation(data.highlightId, data.comments, annotation);
		});

		annotationsContainer.appendChild(annotation);

		// Use Floating UI for positioning (handles all scroll scenarios)
		const cleanup = mountFloatingAnnotation(data.highlightElement, annotation, {
			placement,
			offsetDistance: ANNOTATION_OFFSET,
			viewportPadding: VIEWPORT_PADDING,
			enableFlip: true,
			fallbackPlacements: ["left", "bottom"],
		});

		floatingCleanups.set(data.highlightId, cleanup);

		positionedAnnotations.push({
			highlightId: data.highlightId,
			comments: data.comments,
			top: data.top,
			element: annotation,
		});
	}
}

/**
 * Build compact pill indicators for narrow margins using Floating UI.
 */
function buildDotAnnotations(
	annotationData: Array<{
		highlightId: string;
		comments: ServerComment[];
		top: number;
		highlightElement: HTMLElement;
	}>,
	onAnnotationClick: (highlightId: string, element: HTMLElement) => void
): void {
	if (!annotationsContainer) {
		return;
	}

	const placement = getDefaultPlacement();

	for (const data of annotationData) {
		const pill = document.createElement("button");
		pill.className = "gloss-annotation-pill";
		pill.title = `${data.comments.length} note${data.comments.length > 1 ? "s" : ""}`;
		pill.style.cssText = `
			position: fixed;
			pointer-events: auto;
		`;

		// Comment icon
		const icon = document.createElement("span");
		icon.className = "gloss-pill-icon";
		icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
		pill.appendChild(icon);

		// Count
		const count = document.createElement("span");
		count.className = "gloss-pill-count";
		count.textContent = String(data.comments.length);
		pill.appendChild(count);

		pill.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			onAnnotationClick(data.highlightId, data.highlightElement);
		});

		annotationsContainer.appendChild(pill);

		// Use Floating UI for positioning
		const cleanup = mountFloatingAnnotation(data.highlightElement, pill, {
			placement,
			offsetDistance: ANNOTATION_OFFSET,
			viewportPadding: VIEWPORT_PADDING,
			enableFlip: true,
			fallbackPlacements: ["left", "bottom", "top"],
		});

		floatingCleanups.set(data.highlightId, cleanup);

		positionedAnnotations.push({
			highlightId: data.highlightId,
			comments: data.comments,
			top: data.top,
			element: pill,
		});
	}
}

/**
 * Build a single annotation element.
 */
function buildAnnotationElement(
	comments: ServerComment[],
	isCompact: boolean
): HTMLElement {
	const el = document.createElement("div");

	// Get first (or most recent) comment to display
	const sortedComments = [...comments].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
	);
	const firstComment = sortedComments[0];

	// Author line
	const authorLine = document.createElement("div");
	authorLine.className = "gloss-annotation-author";
	const authorName = firstComment.author.name || "Someone";
	const time = formatRelativeTime(firstComment.createdAt);
	authorLine.textContent = isCompact ? authorName : `${authorName} · ${time}`;
	el.appendChild(authorLine);

	// Comment preview
	const preview = document.createElement("div");
	preview.className = "gloss-annotation-preview";
	const maxLength = isCompact ? 60 : 100;
	let text = firstComment.content;
	if (text.length > maxLength) {
		text = `${text.slice(0, maxLength)}...`;
	}
	preview.textContent = text;
	el.appendChild(preview);

	// "More" indicator if multiple comments
	if (comments.length > 1) {
		const more = document.createElement("div");
		more.className = "gloss-annotation-more";
		more.textContent = `+${comments.length - 1} more`;
		el.appendChild(more);
	}

	return el;
}

/**
 * Set up resize observer to detect margin mode changes.
 * Scroll tracking is handled automatically by Floating UI.
 */
function setupResizeObserver(): void {
	resizeObserver = new ResizeObserver(() => {
		if (currentOptions) {
			// Re-detect margin mode on resize
			const newMode = detectMarginMode();
			if (newMode !== marginMode) {
				marginMode = newMode;
				// Clean up existing positions and rebuild
				cleanupFloatingPositions();
				buildAnnotations(currentOptions);
			}
			// No need to reposition on resize - Floating UI handles it automatically
		}
	});

	resizeObserver.observe(document.body);
}

/**
 * Format relative time string.
 */
function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMinutes = Math.floor(diffMs / 60_000);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMinutes < 1) {
		return "now";
	}
	if (diffMinutes < 60) {
		return `${diffMinutes}m`;
	}
	if (diffHours < 24) {
		return `${diffHours}h`;
	}
	if (diffDays < 30) {
		return `${diffDays}d`;
	}
	return date.toLocaleDateString();
}

// ============================================================================
// EXPANDED ANNOTATION FUNCTIONS
// ============================================================================

interface CommentThread {
	comment: ServerComment;
	replies: CommentThread[];
}

/**
 * Build a tree structure from flat comments list.
 */
function buildCommentTree(comments: ServerComment[]): CommentThread[] {
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

/**
 * Expand an annotation to show all comments with threaded replies.
 */
function expandAnnotation(
	highlightId: string,
	comments: ServerComment[],
	annotationElement: HTMLElement
): void {
	if (!(currentOptions && annotationsContainer)) {
		return;
	}

	// Collapse any previously expanded annotation
	collapseExpandedAnnotation();

	expandedHighlightId = highlightId;
	replyingToId = null;

	const rect = annotationElement.getBoundingClientRect();

	// Build expanded element
	const expanded = document.createElement("div");
	expanded.className = "gloss-annotation-expanded";
	expanded.style.cssText = `
		position: fixed;
		top: ${rect.top}px;
		right: ${VIEWPORT_PADDING}px;
		width: 280px;
		max-height: 400px;
		overflow-y: auto;
		pointer-events: auto;
	`;

	// Header with close button
	const header = document.createElement("div");
	header.className = "gloss-expanded-header";

	const title = document.createElement("span");
	title.className = "gloss-expanded-title";
	title.textContent = `${comments.length} comment${comments.length !== 1 ? "s" : ""}`;
	header.appendChild(title);

	const closeBtn = document.createElement("button");
	closeBtn.className = "gloss-expanded-close";
	closeBtn.innerHTML = "×";
	closeBtn.title = "Close";
	closeBtn.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		collapseExpandedAnnotation();
	});
	header.appendChild(closeBtn);
	expanded.appendChild(header);

	// Build threaded comments
	const tree = buildCommentTree(comments);
	const commentsContainer = document.createElement("div");
	commentsContainer.className = "gloss-expanded-comments";

	for (const thread of tree) {
		renderCommentThread(commentsContainer, thread, 0, highlightId);
	}
	expanded.appendChild(commentsContainer);

	// Reply input area
	if (currentOptions.onCreateComment) {
		const inputArea = buildInlineReplyArea(highlightId);
		expanded.appendChild(inputArea);
	}

	annotationsContainer.appendChild(expanded);
	expandedElement = expanded;

	// Hide the original collapsed annotation
	annotationElement.style.display = "none";

	// Click outside to collapse
	setTimeout(() => {
		document.addEventListener("click", handleClickOutsideExpanded);
	}, 100);
}

/**
 * Collapse the expanded annotation.
 */
function collapseExpandedAnnotation(): void {
	document.removeEventListener("click", handleClickOutsideExpanded);

	if (expandedElement) {
		expandedElement.remove();
		expandedElement = null;
	}

	// Show the original annotation again
	if (expandedHighlightId) {
		const annotation = positionedAnnotations.find(
			(a) => a.highlightId === expandedHighlightId
		);
		if (annotation) {
			annotation.element.style.display = "";
		}
	}

	expandedHighlightId = null;
	replyingToId = null;
}

/**
 * Handle click outside expanded annotation.
 */
function handleClickOutsideExpanded(e: MouseEvent): void {
	if (!expandedElement) {
		return;
	}

	const target = e.target as Node;
	if (!expandedElement.contains(target)) {
		collapseExpandedAnnotation();
	}
}

/**
 * Render a comment thread recursively.
 */
function renderCommentThread(
	container: HTMLElement,
	thread: CommentThread,
	depth: number,
	highlightId: string
): void {
	const { comment, replies } = thread;
	const maxDepth = 2; // Limit nesting for readability

	const commentEl = document.createElement("div");
	commentEl.className = `gloss-expanded-comment${depth > 0 ? " gloss-comment-reply" : ""}`;
	commentEl.style.marginLeft = `${Math.min(depth, maxDepth) * 16}px`;

	// Author line
	const authorLine = document.createElement("div");
	authorLine.className = "gloss-expanded-comment-author";

	const isOwnComment = currentOptions?.currentUserId === comment.authorId;
	const authorName = isOwnComment ? "You" : comment.author.name || "Someone";
	const time = formatRelativeTime(comment.createdAt);

	const authorSpan = document.createElement("span");
	authorSpan.className = "gloss-expanded-author-name";
	authorSpan.textContent = authorName;
	authorLine.appendChild(authorSpan);

	const timeSpan = document.createElement("span");
	timeSpan.className = "gloss-expanded-time";
	timeSpan.textContent = ` · ${time}`;
	authorLine.appendChild(timeSpan);

	commentEl.appendChild(authorLine);

	// Content
	const content = document.createElement("div");
	content.className = "gloss-expanded-comment-content";
	content.innerHTML = renderMarkdown(comment.content);
	commentEl.appendChild(content);

	// Actions (visible on hover)
	const actions = document.createElement("div");
	actions.className = "gloss-expanded-comment-actions";

	// Reply button
	if (currentOptions?.onCreateComment) {
		const replyBtn = document.createElement("button");
		replyBtn.className = "gloss-comment-action-btn";
		replyBtn.textContent = "Reply";
		replyBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			replyingToId = comment.id;
			focusReplyInput();
		});
		actions.appendChild(replyBtn);
	}

	// Delete button for own comments
	if (isOwnComment && currentOptions?.onDeleteComment) {
		const deleteBtn = document.createElement("button");
		deleteBtn.className = "gloss-comment-action-btn gloss-comment-delete-btn";
		deleteBtn.textContent = "Delete";
		deleteBtn.addEventListener("click", async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const success = await currentOptions?.onDeleteComment?.(comment.id);
			if (success) {
				commentEl.remove();
			}
		});
		actions.appendChild(deleteBtn);
	}

	commentEl.appendChild(actions);
	container.appendChild(commentEl);

	// Render replies
	for (const reply of replies) {
		renderCommentThread(container, reply, depth + 1, highlightId);
	}
}

/**
 * Build the inline reply input area.
 */
function buildInlineReplyArea(highlightId: string): HTMLElement {
	const container = document.createElement("div");
	container.className = "gloss-inline-reply-container";

	const input = document.createElement("textarea");
	input.className = "gloss-inline-reply-input";
	input.id = "gloss-inline-reply-textarea";
	input.placeholder = "Write a reply...";
	input.rows = 1;

	// Mention dropdown
	const mentionDropdown = document.createElement("div");
	mentionDropdown.className = "gloss-mention-dropdown";
	mentionDropdown.style.display = "none";

	const mentionState = {
		query: "",
		startPos: -1,
		selectedIndex: 0,
	};

	// Auto-resize
	input.addEventListener("input", async () => {
		input.style.height = "auto";
		input.style.height = `${Math.min(input.scrollHeight, 80)}px`;

		// @mention detection
		if (currentOptions?.onSearchFriends) {
			const value = input.value;
			const cursorPos = input.selectionStart || 0;
			const textBeforeCursor = value.slice(0, cursorPos);
			const lastAtIndex = textBeforeCursor.lastIndexOf("@");

			if (lastAtIndex !== -1) {
				const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
				if (!textAfterAt.includes(" ")) {
					mentionState.query = textAfterAt;
					mentionState.startPos = lastAtIndex;

					knownFriends = await currentOptions.onSearchFriends(
						mentionState.query
					);
					mentionState.selectedIndex = 0;

					if (knownFriends.length > 0) {
						showMentionDropdown(
							mentionDropdown,
							knownFriends,
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
		}
	});

	// Keyboard handling
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex keyboard handler with many cases
	input.addEventListener("keydown", async (e) => {
		// Handle mention dropdown navigation
		if (mentionDropdown.style.display !== "none" && knownFriends.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				mentionState.selectedIndex = Math.min(
					mentionState.selectedIndex + 1,
					knownFriends.length - 1
				);
				updateMentionSelection(mentionDropdown, mentionState.selectedIndex);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				mentionState.selectedIndex = Math.max(
					mentionState.selectedIndex - 1,
					0
				);
				updateMentionSelection(mentionDropdown, mentionState.selectedIndex);
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				const friend = knownFriends[mentionState.selectedIndex];
				if (friend) {
					insertMention(input, mentionState.startPos, friend);
					hideMentionDropdown(mentionDropdown);
				}
				return;
			}
			if (e.key === "Escape") {
				hideMentionDropdown(mentionDropdown);
				return;
			}
		}

		// Submit on Enter (without Shift)
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			const content = input.value.trim();
			if (!(content && currentOptions?.onCreateComment)) {
				return;
			}

			// Extract mentions
			const mentions = extractMentions(content, knownFriends);

			input.disabled = true;
			const newComment = await currentOptions.onCreateComment(
				highlightId,
				content,
				mentions,
				replyingToId ?? undefined
			);
			input.disabled = false;

			if (newComment) {
				input.value = "";
				input.style.height = "auto";
				replyingToId = null;

				// Refresh the expanded view
				refreshExpandedAnnotation(highlightId);
			}
		}
	});

	container.appendChild(input);
	container.appendChild(mentionDropdown);

	// Hint
	const hint = document.createElement("span");
	hint.className = "gloss-reply-hint";
	hint.textContent = "↵ to send";
	container.appendChild(hint);

	return container;
}

/**
 * Refresh the expanded annotation after a new comment.
 */
function refreshExpandedAnnotation(highlightId: string): void {
	if (!expandedHighlightId || expandedHighlightId !== highlightId) {
		return;
	}
	if (!currentOptions) {
		return;
	}

	// Find the annotation data
	const annotationData = positionedAnnotations.find(
		(a) => a.highlightId === highlightId
	);
	if (!annotationData) {
		return;
	}

	// Re-fetch comments from summary (would need to reload from server ideally)
	// For now, we'll trust the local data was updated
	const summaryData = currentOptions.summary.highlightComments.find(
		(hc) => hc.highlightId === highlightId
	);
	if (!summaryData) {
		return;
	}

	// Re-expand with updated comments
	const annotationElement = annotationData.element;
	collapseExpandedAnnotation();

	// Small delay to allow cleanup
	setTimeout(() => {
		expandAnnotation(highlightId, summaryData.comments, annotationElement);
	}, 50);
}

/**
 * Focus the reply input.
 */
function focusReplyInput(): void {
	const input = expandedElement?.querySelector(
		"#gloss-inline-reply-textarea"
	) as HTMLTextAreaElement | null;
	if (input) {
		input.focus();
		if (replyingToId) {
			input.placeholder = "Write a reply...";
		}
	}
}

/**
 * Show mention dropdown.
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
 * Hide mention dropdown.
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
function extractMentions(content: string, friends: Friend[]): string[] {
	const mentionRegex = /@(\w+)/g;
	const mentions: string[] = [];

	for (const match of content.matchAll(mentionRegex)) {
		const name = match[1];
		const friend = friends.find(
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

// ============================================================================
// END EXPANDED ANNOTATION FUNCTIONS
// ============================================================================

/**
 * Annotation-specific styles.
 */
const ANNOTATION_STYLES = `
  .gloss-annotations-container {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }

  .gloss-annotation {
    cursor: pointer;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(0, 0, 0, 0.06);
    transition: all 0.15s ease;
    animation: gloss-annotation-fade-in 0.2s ease-out;
  }

  @keyframes gloss-annotation-fade-in {
    from {
      opacity: 0;
      transform: translateX(8px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .gloss-annotation:hover {
    background: rgba(255, 255, 255, 0.95);
    border-color: rgba(0, 0, 0, 0.1);
  }

  @media (prefers-color-scheme: dark) {
    .gloss-annotation {
      background: rgba(38, 38, 38, 0.85);
      border-color: rgba(255, 255, 255, 0.08);
    }

    .gloss-annotation:hover {
      background: rgba(38, 38, 38, 0.95);
      border-color: rgba(255, 255, 255, 0.12);
    }
  }

  .gloss-annotation-author {
    font-size: 11px;
    font-weight: 500;
    color: #666666;
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-annotation-author {
      color: #999999;
    }
  }

  .gloss-annotation-preview {
    font-size: 11px;
    line-height: 1.4;
    color: #888888;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .gloss-annotation.compact .gloss-annotation-preview {
    -webkit-line-clamp: 1;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-annotation-preview {
      color: #777777;
    }
  }

  .gloss-annotation-more {
    font-size: 10px;
    color: #aaaaaa;
    margin-top: 2px;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-annotation-more {
      color: #666666;
    }
  }

  /* Pill indicator styles (for narrow margins) */
  .gloss-annotation-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(8px);
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
    animation: gloss-annotation-fade-in 0.2s ease-out;
    font-family: "Satoshi", system-ui, -apple-system, sans-serif;
  }

  .gloss-annotation-pill:hover {
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.06);
    transform: translateX(-2px);
  }

  @media (prefers-color-scheme: dark) {
    .gloss-annotation-pill {
      background: rgba(38, 38, 38, 0.98);
      border-color: rgba(255, 255, 255, 0.1);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .gloss-annotation-pill:hover {
      background: #2a2a2a;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }
  }

  .gloss-pill-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #f59e0b;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-pill-icon {
      color: #fbbf24;
    }
  }

  .gloss-pill-count {
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    min-width: 8px;
    text-align: center;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-pill-count {
      color: #e5e5e5;
    }
  }

  /* Hover pill specific styles */
  .gloss-hover-pill {
    animation: gloss-hover-pill-in 0.15s ease-out;
  }

  @keyframes gloss-hover-pill-in {
    from {
      opacity: 0;
      transform: translateX(8px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* Expanded annotation styles */
  .gloss-annotation-expanded {
    background: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    animation: gloss-expand-in 0.2s ease-out;
  }

  @keyframes gloss-expand-in {
    from {
      opacity: 0;
      transform: scale(0.95) translateX(8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateX(0);
    }
  }

  @media (prefers-color-scheme: dark) {
    .gloss-annotation-expanded {
      background: #1a1a1a;
      border-color: rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    }
  }

  .gloss-expanded-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  @media (prefers-color-scheme: dark) {
    .gloss-expanded-header {
      border-color: rgba(255, 255, 255, 0.08);
    }
  }

  .gloss-expanded-title {
    font-size: 12px;
    font-weight: 600;
    color: #666;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-expanded-title {
      color: #999;
    }
  }

  .gloss-expanded-close {
    background: none;
    border: none;
    font-size: 18px;
    color: #999;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .gloss-expanded-close:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #666;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-expanded-close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ccc;
    }
  }

  .gloss-expanded-comments {
    padding: 8px 0;
    max-height: 280px;
    overflow-y: auto;
  }

  .gloss-expanded-comment {
    padding: 8px 12px;
    position: relative;
  }

  .gloss-expanded-comment:hover .gloss-expanded-comment-actions {
    opacity: 1;
  }

  .gloss-comment-reply {
    border-left: 2px solid rgba(0, 0, 0, 0.08);
  }

  @media (prefers-color-scheme: dark) {
    .gloss-comment-reply {
      border-color: rgba(255, 255, 255, 0.1);
    }
  }

  .gloss-expanded-comment-author {
    display: flex;
    align-items: baseline;
    gap: 2px;
  }

  .gloss-expanded-author-name {
    font-weight: 600;
    font-size: 12px;
    color: #1a1a1a;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-expanded-author-name {
      color: #e5e5e5;
    }
  }

  .gloss-expanded-time {
    font-size: 11px;
    color: #888;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-expanded-time {
      color: #777;
    }
  }

  .gloss-expanded-comment-content {
    font-size: 13px;
    line-height: 1.5;
    color: #333;
    margin-top: 2px;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-expanded-comment-content {
      color: #ccc;
    }
  }

  .gloss-expanded-comment-content a {
    color: #3b82f6;
    text-decoration: none;
  }

  .gloss-expanded-comment-content a:hover {
    text-decoration: underline;
  }

  .gloss-expanded-comment-content code {
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 12px;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-expanded-comment-content code {
      background: rgba(255, 255, 255, 0.1);
    }
  }

  .gloss-mention {
    background: rgba(168, 85, 247, 0.1);
    color: #9333ea;
    padding: 0 2px;
    border-radius: 2px;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-mention {
      background: rgba(168, 85, 247, 0.2);
      color: #c084fc;
    }
  }

  .gloss-expanded-comment-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .gloss-comment-action-btn {
    font-size: 11px;
    color: #888;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 2px;
  }

  .gloss-comment-action-btn:hover {
    color: #333;
    background: rgba(0, 0, 0, 0.05);
  }

  @media (prefers-color-scheme: dark) {
    .gloss-comment-action-btn:hover {
      color: #ddd;
      background: rgba(255, 255, 255, 0.1);
    }
  }

  .gloss-comment-delete-btn:hover {
    color: #ef4444;
  }

  /* Inline reply styles */
  .gloss-inline-reply-container {
    padding: 8px 12px;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    position: relative;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-inline-reply-container {
      border-color: rgba(255, 255, 255, 0.08);
    }
  }

  .gloss-inline-reply-input {
    width: 100%;
    padding: 8px;
    font-size: 13px;
    font-family: inherit;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 6px;
    resize: none;
    min-height: 32px;
    background: #fff;
    color: #1a1a1a;
    box-sizing: border-box;
  }

  .gloss-inline-reply-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  @media (prefers-color-scheme: dark) {
    .gloss-inline-reply-input {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.15);
      color: #e5e5e5;
    }

    .gloss-inline-reply-input:focus {
      border-color: #3b82f6;
    }
  }

  .gloss-reply-hint {
    position: absolute;
    right: 20px;
    bottom: 16px;
    font-size: 10px;
    color: #aaa;
    pointer-events: none;
  }

  /* Mention dropdown styles */
  .gloss-mention-dropdown {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 100%;
    margin-bottom: 4px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    max-height: 150px;
    overflow-y: auto;
    z-index: 10;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-mention-dropdown {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.1);
    }
  }

  .gloss-mention-item {
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    color: #333;
  }

  .gloss-mention-item:hover,
  .gloss-mention-item.selected {
    background: rgba(59, 130, 246, 0.1);
    color: #1a1a1a;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-mention-item {
      color: #ccc;
    }

    .gloss-mention-item:hover,
    .gloss-mention-item.selected {
      background: rgba(59, 130, 246, 0.2);
      color: #fff;
    }
  }
`;
