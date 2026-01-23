/**
 * AnnotationController - Orchestrates annotation display modes.
 *
 * Manages the lifecycle of margin annotations, switching between
 * display modes based on available viewport space, and coordinating
 * with AnchorManager for positioning.
 */

import type { HighlightManager } from "@gloss/anchoring";
import type {
	Friend,
	PageCommentSummary,
	ServerComment,
} from "../utils/messages";
import { AnchorManager } from "./anchor-manager";
import {
	getDefaultPlacement,
	mountFloatingAnnotation,
} from "./floating-annotation";
import { injectStyles } from "./styles";

export type DisplayMode = "margin" | "compact" | "inline";

export interface AnnotationControllerOptions {
	/** HighlightManager for accessing highlights */
	manager: HighlightManager;
	/** Comment data for all highlights */
	summary: PageCommentSummary;
	/** Current user ID for showing own comments differently */
	currentUserId?: string;
	/** Callback when annotation is clicked */
	onAnnotationClick?: (highlightId: string, element: HTMLElement) => void;
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

// Thresholds for display modes
const MIN_MARGIN_FULL = 200;
const MIN_MARGIN_COMPACT = 120;
const VIEWPORT_PADDING = 16;

/**
 * Controller that manages annotation display and positioning.
 */
export class AnnotationController {
	private readonly manager: HighlightManager;
	private readonly anchorManager: AnchorManager;
	private options: AnnotationControllerOptions;

	private host: HTMLElement | null = null;
	private container: HTMLElement | null = null;
	private displayMode: DisplayMode = "margin";
	private isVisible = false;

	// Cleanup functions for Floating UI autoUpdate
	private positioningCleanups = new Map<string, () => void>();

	// Resize observer for mode changes
	private resizeObserver: ResizeObserver | null = null;

	constructor(options: AnnotationControllerOptions) {
		this.options = options;
		this.manager = options.manager;
		this.anchorManager = new AnchorManager({ manager: this.manager });
	}

	/**
	 * Show annotations for all highlights with comments.
	 */
	show(): void {
		if (this.isVisible) {
			this.update(this.options.summary);
			return;
		}

		const { summary } = this.options;

		// Don't show if no comments
		if (summary.highlightComments.length === 0) {
			return;
		}

		// Detect display mode
		this.displayMode = this.detectDisplayMode();

		// Create shadow DOM host
		this.createHost();

		// Create anchors for highlights with comments
		this.createAnchors();

		// Build annotation elements
		this.buildAnnotations();

		// Start observing for mode changes
		this.startResizeObserver();

		this.isVisible = true;
	}

	/**
	 * Hide all annotations.
	 */
	hide(): void {
		if (!this.isVisible) {
			return;
		}

		this.stopResizeObserver();
		this.cleanupPositioning();
		this.anchorManager.clear();

		if (this.host) {
			this.host.remove();
			this.host = null;
			this.container = null;
		}

		this.isVisible = false;
	}

	/**
	 * Update annotations with new comment data.
	 */
	update(summary: PageCommentSummary): void {
		this.options = { ...this.options, summary };

		if (!this.isVisible) {
			return;
		}

		// Sync anchors with current highlights
		this.anchorManager.sync();

		// Rebuild annotations
		this.cleanupPositioning();
		if (this.container) {
			this.container.innerHTML = "";
		}
		this.buildAnnotations();
	}

	/**
	 * Get current display mode.
	 */
	getDisplayMode(): DisplayMode {
		return this.displayMode;
	}

	/**
	 * Check if annotations are visible.
	 */
	getIsVisible(): boolean {
		return this.isVisible;
	}

	/**
	 * Clean up all resources.
	 */
	destroy(): void {
		this.hide();
		this.anchorManager.destroy();
	}

	// =========================================================================
	// Private Methods
	// =========================================================================

	private createHost(): void {
		const host = document.createElement("div");
		host.id = "gloss-annotation-controller";
		host.style.cssText =
			"position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 2147483645; pointer-events: none;";

		const shadowRoot = host.attachShadow({ mode: "closed" });
		injectStyles(shadowRoot);

		// Add annotation styles
		const styles = document.createElement("style");
		styles.textContent = ANNOTATION_STYLES;
		shadowRoot.appendChild(styles);

		// Create container
		const container = document.createElement("div");
		container.className = "gloss-annotations-container";
		shadowRoot.appendChild(container);

		document.body.appendChild(host);
		this.host = host;
		this.container = container;
	}

	private createAnchors(): void {
		const { summary } = this.options;

		for (const hc of summary.highlightComments) {
			this.anchorManager.createAnchor(hc.highlightId);
		}
	}

	private buildAnnotations(): void {
		if (!this.container) {
			return;
		}

		const { summary, onAnnotationClick } = this.options;

		// Get positioning data for each highlight
		const annotationData: Array<{
			highlightId: string;
			comments: ServerComment[];
			anchor: HTMLElement;
		}> = [];

		for (const hc of summary.highlightComments) {
			// Prefer anchor element, fall back to highlight element
			const anchor =
				this.anchorManager.getAnchor(hc.highlightId) ??
				this.anchorManager.getHighlightElement(hc.highlightId);

			if (!anchor) {
				continue;
			}

			annotationData.push({
				highlightId: hc.highlightId,
				comments: hc.comments,
				anchor,
			});
		}

		// Build based on mode
		if (this.displayMode === "inline") {
			this.buildInlineAnnotations(annotationData, onAnnotationClick);
		} else {
			this.buildMarginAnnotations(annotationData, onAnnotationClick);
		}
	}

	private buildMarginAnnotations(
		data: Array<{
			highlightId: string;
			comments: ServerComment[];
			anchor: HTMLElement;
		}>,
		onAnnotationClick?: (highlightId: string, element: HTMLElement) => void
	): void {
		if (!this.container) {
			return;
		}

		const isCompact = this.displayMode === "compact";
		const placement = getDefaultPlacement();

		for (const item of data) {
			const annotation = this.createAnnotationElement(item.comments, isCompact);
			annotation.className = `gloss-annotation${isCompact ? " compact" : ""}`;
			annotation.style.pointerEvents = "auto";

			// Handle click
			annotation.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				onAnnotationClick?.(item.highlightId, item.anchor);
			});

			this.container.appendChild(annotation);

			// Position using Floating UI
			const cleanup = mountFloatingAnnotation(item.anchor, annotation, {
				placement,
				offsetDistance: VIEWPORT_PADDING,
				viewportPadding: 8,
				enableFlip: true,
				fallbackPlacements: ["left", "bottom"],
			});

			this.positioningCleanups.set(item.highlightId, cleanup);
		}
	}

	private buildInlineAnnotations(
		data: Array<{
			highlightId: string;
			comments: ServerComment[];
			anchor: HTMLElement;
		}>,
		onAnnotationClick?: (highlightId: string, element: HTMLElement) => void
	): void {
		if (!this.container) {
			return;
		}

		const placement = getDefaultPlacement();

		for (const item of data) {
			// Create pill indicator
			const pill = document.createElement("button");
			pill.className = "gloss-annotation-pill";
			pill.title = `${item.comments.length} note${item.comments.length > 1 ? "s" : ""}`;
			pill.style.pointerEvents = "auto";

			// Comment icon
			const icon = document.createElement("span");
			icon.className = "gloss-pill-icon";
			icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
			pill.appendChild(icon);

			// Count
			const count = document.createElement("span");
			count.className = "gloss-pill-count";
			count.textContent = String(item.comments.length);
			pill.appendChild(count);

			pill.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				onAnnotationClick?.(item.highlightId, item.anchor);
			});

			this.container.appendChild(pill);

			// Position using Floating UI
			const cleanup = mountFloatingAnnotation(item.anchor, pill, {
				placement,
				offsetDistance: VIEWPORT_PADDING,
				viewportPadding: 8,
				enableFlip: true,
				fallbackPlacements: ["left", "bottom", "top"],
			});

			this.positioningCleanups.set(item.highlightId, cleanup);
		}
	}

	private createAnnotationElement(
		comments: ServerComment[],
		isCompact: boolean
	): HTMLElement {
		const el = document.createElement("div");

		// Get most recent comment
		const sortedComments = [...comments].sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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

		// "More" indicator
		if (comments.length > 1) {
			const more = document.createElement("div");
			more.className = "gloss-annotation-more";
			more.textContent = `+${comments.length - 1} more`;
			el.appendChild(more);
		}

		return el;
	}

	private detectDisplayMode(): DisplayMode {
		const viewportWidth = window.innerWidth;
		const contentWidth = this.estimateContentWidth();
		const rightMargin = viewportWidth - contentWidth - VIEWPORT_PADDING;

		if (rightMargin >= MIN_MARGIN_FULL) {
			return "margin";
		}
		if (rightMargin >= MIN_MARGIN_COMPACT) {
			return "compact";
		}
		return "inline";
	}

	private estimateContentWidth(): number {
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

		// Fallback
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

	private startResizeObserver(): void {
		this.resizeObserver = new ResizeObserver(() => {
			const newMode = this.detectDisplayMode();
			if (newMode !== this.displayMode) {
				this.displayMode = newMode;
				this.cleanupPositioning();
				if (this.container) {
					this.container.innerHTML = "";
				}
				this.buildAnnotations();
			}
		});

		this.resizeObserver.observe(document.body);
	}

	private stopResizeObserver(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	private cleanupPositioning(): void {
		for (const cleanup of this.positioningCleanups.values()) {
			cleanup();
		}
		this.positioningCleanups.clear();
	}
}

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
    padding: 6px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid rgba(0, 0, 0, 0.08);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    backdrop-filter: blur(8px);
    max-width: 180px;
    transition: background-color 0.15s ease, box-shadow 0.15s ease;
    animation: gloss-annotation-fade-in 0.2s ease-out;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .gloss-annotation.compact {
    max-width: 140px;
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
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }

  @media (prefers-color-scheme: dark) {
    .gloss-annotation {
      background: rgba(38, 38, 38, 0.98);
      border-color: rgba(255, 255, 255, 0.1);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .gloss-annotation:hover {
      background: #2a2a2a;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
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
    color: #555555;
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
      color: #aaaaaa;
    }
  }

  .gloss-annotation-more {
    font-size: 10px;
    color: #888888;
    margin-top: 2px;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-annotation-more {
      color: #777777;
    }
  }

  /* Pill styles */
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
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    animation: gloss-annotation-fade-in 0.2s ease-out;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .gloss-annotation-pill:hover {
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
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
`;
