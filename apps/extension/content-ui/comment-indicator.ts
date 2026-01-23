/**
 * Floating comment indicator showing who has commented on the current page.
 * Appears in top-right corner of viewport with stacked avatars.
 */

import type { PageCommentSummary } from "../utils/messages";
import { injectStyles } from "./styles";

export interface CommentIndicatorOptions {
	/** Comment summary data for the page */
	summary: PageCommentSummary;
	/** Callback when indicator is clicked */
	onToggleAnnotations: () => void;
	/** Whether annotations are currently visible */
	annotationsVisible: boolean;
}

const INDICATOR_ID = "gloss-comment-indicator";
const MAX_VISIBLE_AVATARS = 3;

let currentHost: HTMLElement | null = null;
let currentIndicator: HTMLElement | null = null;

/**
 * Show the comment indicator with commenter avatars.
 */
export function showCommentIndicator(options: CommentIndicatorOptions): void {
	const { summary, onToggleAnnotations, annotationsVisible } = options;

	// Don't show if no comments
	if (summary.totalComments === 0) {
		hideCommentIndicator();
		return;
	}

	// Remove existing indicator
	hideCommentIndicator();

	// Create host with shadow DOM
	const host = document.createElement("div");
	host.id = INDICATOR_ID;
	host.style.cssText =
		"position: fixed; top: 0; left: 0; z-index: 2147483646; pointer-events: none;";

	const shadowRoot = host.attachShadow({ mode: "closed" });
	injectStyles(shadowRoot);

	// Add indicator-specific styles
	const indicatorStyles = document.createElement("style");
	indicatorStyles.textContent = INDICATOR_STYLES;
	shadowRoot.appendChild(indicatorStyles);

	// Build indicator element
	const indicator = buildIndicator(
		summary,
		annotationsVisible,
		onToggleAnnotations
	);
	shadowRoot.appendChild(indicator);

	document.body.appendChild(host);
	currentHost = host;
	currentIndicator = indicator;
}

/**
 * Update the indicator's active state without rebuilding.
 */
export function updateCommentIndicatorState(annotationsVisible: boolean): void {
	if (!currentIndicator) {
		return;
	}

	const btn = currentIndicator.querySelector(
		".gloss-indicator-btn"
	) as HTMLButtonElement | null;
	if (btn) {
		btn.classList.toggle("active", annotationsVisible);
		// Update tooltip based on current state
		btn.title = annotationsVisible ? "Hide comments" : "Show comments";
	}
}

/**
 * Hide and remove the comment indicator.
 */
export function hideCommentIndicator(): void {
	if (currentHost) {
		currentHost.remove();
		currentHost = null;
		currentIndicator = null;
	}
}

/**
 * Check if indicator is currently visible.
 */
export function isCommentIndicatorVisible(): boolean {
	return currentHost !== null;
}

/**
 * Build the indicator element with avatars.
 */
function buildIndicator(
	summary: PageCommentSummary,
	annotationsVisible: boolean,
	onToggle: () => void
): HTMLElement {
	const container = document.createElement("div");
	container.className = "gloss-indicator-container";

	const btn = document.createElement("button");
	btn.className = `gloss-indicator-btn${annotationsVisible ? " active" : ""}`;
	btn.title = annotationsVisible ? "Hide comments" : "Show comments";
	btn.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		onToggle();
	});

	// Comment icon
	const icon = document.createElement("span");
	icon.className = "gloss-indicator-icon";
	icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
	btn.appendChild(icon);

	// Count display
	const count = document.createElement("span");
	count.className = "gloss-indicator-count";
	count.textContent = String(summary.totalComments);
	btn.appendChild(count);

	// Avatar stack (show up to 3 commenters)
	const visibleCommenters = summary.commenters.slice(0, MAX_VISIBLE_AVATARS);
	if (visibleCommenters.length > 0) {
		const avatarStack = document.createElement("div");
		avatarStack.className = "gloss-avatar-stack";

		for (let i = 0; i < visibleCommenters.length; i++) {
			const commenter = visibleCommenters[i];
			const avatar = document.createElement("div");
			avatar.className = "gloss-avatar";
			avatar.style.zIndex = String(visibleCommenters.length - i);

			if (commenter.image) {
				const img = document.createElement("img");
				img.src = commenter.image;
				img.alt = commenter.name || "User";
				img.draggable = false;
				avatar.appendChild(img);
			} else {
				// Fallback to initials
				avatar.textContent = getInitials(commenter.name);
				avatar.classList.add("gloss-avatar-initials");
			}

			avatarStack.appendChild(avatar);
		}

		btn.appendChild(avatarStack);
	}

	container.appendChild(btn);
	return container;
}

/** Regex for splitting name into parts */
const NAME_SPLIT_REGEX = /\s+/;

/**
 * Get initials from a name.
 */
function getInitials(name: string | null): string {
	if (!name) {
		return "?";
	}
	const parts = name.trim().split(NAME_SPLIT_REGEX);
	if (parts.length >= 2) {
		const lastPart = parts.at(-1);
		return (parts[0][0] + (lastPart?.[0] ?? "")).toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
}

/**
 * Indicator-specific styles.
 */
const INDICATOR_STYLES = `
  .gloss-indicator-container {
    position: fixed;
    top: 16px;
    right: 16px;
    pointer-events: auto;
    animation: gloss-indicator-fade-in 0.2s ease-out;
    font-family: "Satoshi", system-ui, -apple-system, sans-serif;
  }

  @keyframes gloss-indicator-fade-in {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .gloss-indicator-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    font-family: inherit;
  }

  .gloss-indicator-btn:hover {
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    transform: translateY(-1px);
  }

  .gloss-indicator-btn.active {
    background: #fef3c7;
    border-color: rgba(217, 119, 6, 0.25);
  }

  @media (prefers-color-scheme: dark) {
    .gloss-indicator-btn {
      background: rgba(38, 38, 38, 0.98);
      border-color: rgba(255, 255, 255, 0.12);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    }

    .gloss-indicator-btn:hover {
      background: #2a2a2a;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    }

    .gloss-indicator-btn.active {
      background: rgba(120, 53, 15, 0.95);
      border-color: rgba(217, 119, 6, 0.35);
    }
  }

  .gloss-indicator-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #f59e0b;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-indicator-icon {
      color: #fbbf24;
    }
  }

  .gloss-indicator-count {
    font-size: 14px;
    font-weight: 600;
    color: #1a1a1a;
    min-width: 12px;
    text-align: center;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-indicator-count {
      color: #e5e5e5;
    }
  }

  .gloss-avatar-stack {
    display: flex;
    flex-direction: row-reverse;
    margin-left: 2px;
  }

  .gloss-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid #ffffff;
    background: #e5e5e5;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: -6px;
    position: relative;
    flex-shrink: 0;
  }

  .gloss-avatar:last-child {
    margin-left: 0;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-avatar {
      border-color: #2a2a2a;
      background: #404040;
    }
  }

  .gloss-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .gloss-avatar-initials {
    font-size: 9px;
    font-weight: 600;
    color: #666666;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-avatar-initials {
      color: #a0a0a0;
    }
  }
`;
