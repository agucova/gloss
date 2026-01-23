/**
 * CSS styles for content script UI components.
 * Injected into shadow DOM for isolation from page styles.
 */

export const POPOVER_STYLES = `
  @import url("https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap");

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  .gloss-popover {
    font-family: "Satoshi", system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #1a1a1a;
    background: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 20px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
    padding: 4px;
    max-width: 280px;
    z-index: 2147483647;
    position: fixed;
    animation: gloss-fade-in 0.15s ease-out;
  }

  @keyframes gloss-fade-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .gloss-popover.hiding {
    animation: gloss-fade-out 0.1s ease-in forwards;
  }

  @keyframes gloss-fade-out {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .gloss-popover {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.1);
      color: #e5e5e5;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2);
    }
  }

  /* Button styles */
  .gloss-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.15s ease, opacity 0.15s ease;
    white-space: nowrap;
  }

  .gloss-btn:focus {
    outline: 2px solid rgba(0, 0, 0, 0.2);
    outline-offset: 1px;
  }

  .gloss-btn-primary {
    background: #1a1a1a;
    color: #ffffff;
  }

  .gloss-btn-primary:hover {
    background: #333333;
  }

  .gloss-btn-primary:disabled {
    background: #999999;
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-btn-primary {
      background: #e5e5e5;
      color: #1a1a1a;
    }

    .gloss-btn-primary:hover {
      background: #ffffff;
    }

    .gloss-btn:focus {
      outline-color: rgba(255, 255, 255, 0.3);
    }
  }

  .gloss-btn-ghost {
    background: transparent;
    color: #666666;
  }

  .gloss-btn-ghost:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #1a1a1a;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-btn-ghost {
      color: #999999;
    }

    .gloss-btn-ghost:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #e5e5e5;
    }
  }

  .gloss-btn-danger {
    background: transparent;
    color: #dc2626;
  }

  .gloss-btn-danger:hover {
    background: rgba(220, 38, 38, 0.1);
  }

  /* Link styles */
  .gloss-link {
    color: #666666;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
    background: none;
    border: none;
    font-size: inherit;
    padding: 0;
  }

  .gloss-link:hover {
    color: #1a1a1a;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-link {
      color: #999999;
    }

    .gloss-link:hover {
      color: #e5e5e5;
    }
  }

  /* Color picker styles */
  .gloss-color-picker {
    display: flex;
    gap: 6px;
    padding: 4px 0;
  }

  .gloss-color-swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.1s ease, border-color 0.1s ease;
  }

  .gloss-color-swatch:hover {
    transform: scale(1.15);
  }

  .gloss-color-swatch.selected {
    border-color: #1a1a1a;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-color-swatch.selected {
      border-color: #e5e5e5;
    }
  }

  /* Divider */
  .gloss-divider {
    height: 1px;
    background: rgba(0, 0, 0, 0.08);
    margin: 8px 0;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-divider {
      background: rgba(255, 255, 255, 0.1);
    }
  }

  /* Text styles */
  .gloss-text-muted {
    color: #666666;
    font-size: 11px;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-text-muted {
      color: #999999;
    }
  }

  .gloss-text-sm {
    font-size: 12px;
  }

  /* Input styles */
  .gloss-input {
    width: 100%;
    padding: 8px 10px;
    font-size: 12px;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 6px;
    background: #ffffff;
    color: #1a1a1a;
    resize: vertical;
    min-height: 60px;
  }

  .gloss-input:focus {
    outline: none;
    border-color: #1a1a1a;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-input {
      background: #1a1a1a;
      border-color: rgba(255, 255, 255, 0.15);
      color: #e5e5e5;
    }

    .gloss-input:focus {
      border-color: #e5e5e5;
    }
  }

  /* User info styles */
  .gloss-user-info {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .gloss-user-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .gloss-user-name {
    font-size: 12px;
    color: #1a1a1a;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-user-name {
      color: #e5e5e5;
    }
  }

  /* Flex utilities */
  .gloss-flex {
    display: flex;
  }

  .gloss-flex-col {
    flex-direction: column;
  }

  .gloss-items-center {
    align-items: center;
  }

  .gloss-justify-between {
    justify-content: space-between;
  }

  .gloss-gap-2 {
    gap: 8px;
  }

  .gloss-gap-1 {
    gap: 4px;
  }

  /* Sign-in prompt */
  .gloss-signin-prompt {
    text-align: center;
    padding: 4px 8px;
  }

  .gloss-signin-prompt p {
    margin-bottom: 8px;
    color: #666666;
    font-size: 12px;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-signin-prompt p {
      color: #999999;
    }
  }

  /* Icon button - minimal floating style */
  .gloss-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: #fef3c7;
    color: #92400e;
    cursor: pointer;
    transition: transform 0.1s ease, background-color 0.15s ease;
  }

  .gloss-icon-btn:hover {
    background: #fde68a;
    transform: scale(1.1);
  }

  .gloss-icon-btn:active {
    transform: scale(0.95);
  }

  @media (prefers-color-scheme: dark) {
    .gloss-icon-btn {
      background: #78350f;
      color: #fef3c7;
    }

    .gloss-icon-btn:hover {
      background: #92400e;
    }
  }

  /* ============================================================================
   * Comment Panel Styles
   * ============================================================================ */

  .gloss-comment-panel {
    max-width: 280px;
    max-height: 400px;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    padding: 0;
    overflow: hidden;
  }

  .gloss-panel-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-height: 400px;
  }

  .gloss-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    flex-shrink: 0;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-panel-header {
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }
  }

  .gloss-panel-info {
    font-size: 12px;
    color: #666666;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-panel-info {
      color: #999999;
    }
  }

  .gloss-btn-icon {
    padding: 4px;
    border-radius: 4px;
    color: #999999;
  }

  .gloss-btn-icon:hover {
    color: #dc2626;
    background: rgba(220, 38, 38, 0.1);
  }

  .gloss-comments-list {
    overflow-y: auto;
    min-height: 0;
  }

  .gloss-comments-list:not(:empty) {
    flex: 1;
    padding: 8px 12px;
  }

  .gloss-comments-list:empty {
    display: none;
  }

  .gloss-comment {
    padding: 8px 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  }

  .gloss-comment:last-child {
    border-bottom: none;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-comment {
      border-bottom-color: rgba(255, 255, 255, 0.06);
    }
  }

  .gloss-comment-author {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: #888888;
    margin-bottom: 4px;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-comment-author {
      color: #777777;
    }
  }

  .gloss-comment-delete {
    background: none;
    border: none;
    color: #999999;
    font-size: 10px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
  }

  .gloss-comment-delete:hover {
    color: #dc2626;
    background: rgba(220, 38, 38, 0.1);
  }

  .gloss-comment-content {
    font-size: 13px;
    line-height: 1.5;
    color: #1a1a1a;
    word-wrap: break-word;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-comment-content {
      color: #e5e5e5;
    }
  }

  .gloss-comment-content strong {
    font-weight: 600;
  }

  .gloss-comment-content em {
    font-style: italic;
  }

  .gloss-comment-content code {
    font-family: ui-monospace, monospace;
    font-size: 12px;
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 4px;
    border-radius: 3px;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-comment-content code {
      background: rgba(255, 255, 255, 0.1);
    }
  }

  .gloss-comment-content a {
    color: #2563eb;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-comment-content a {
      color: #60a5fa;
    }
  }

  .gloss-mention {
    color: #7c3aed;
    font-weight: 500;
    background: rgba(124, 58, 237, 0.1);
    padding: 0 3px;
    border-radius: 3px;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-mention {
      color: #a78bfa;
      background: rgba(167, 139, 250, 0.15);
    }
  }

  .gloss-comment-input-container {
    position: relative;
    padding: 8px 12px 10px;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    flex-shrink: 0;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-comment-input-container {
      border-top-color: rgba(255, 255, 255, 0.08);
    }
  }

  .gloss-comment-input {
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

  .gloss-comment-input:focus {
    outline: none;
    border-color: #1a1a1a;
  }

  .gloss-comment-input::placeholder {
    color: #999999;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-comment-input {
      background: #1a1a1a;
      border-color: rgba(255, 255, 255, 0.12);
      color: #e5e5e5;
    }

    .gloss-comment-input:focus {
      border-color: #e5e5e5;
    }

    .gloss-comment-input::placeholder {
      color: #666666;
    }
  }

  .gloss-input-hint {
    position: absolute;
    right: 20px;
    bottom: 18px;
    font-size: 10px;
    color: #bbbbbb;
    pointer-events: none;
  }

  @media (prefers-color-scheme: dark) {
    .gloss-input-hint {
      color: #555555;
    }
  }

  .gloss-mention-dropdown {
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
    .gloss-mention-dropdown {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.15);
    }
  }

  .gloss-mention-item {
    padding: 8px 12px;
    font-size: 13px;
    cursor: pointer;
    color: #1a1a1a;
  }

  .gloss-mention-item:hover,
  .gloss-mention-item.selected {
    background: rgba(0, 0, 0, 0.05);
  }

  @media (prefers-color-scheme: dark) {
    .gloss-mention-item {
      color: #e5e5e5;
    }

    .gloss-mention-item:hover,
    .gloss-mention-item.selected {
      background: rgba(255, 255, 255, 0.1);
    }
  }
`;

/**
 * Inject styles into a shadow root.
 */
export function injectStyles(shadowRoot: ShadowRoot): void {
	const style = document.createElement("style");
	style.textContent = POPOVER_STYLES;
	shadowRoot.appendChild(style);
}
