import { type Highlight, HighlightManager } from "@gloss/anchoring";
import { render } from "solid-js/web";

import type { Id } from "../../../convex/_generated/dataModel";
import type { BridgeHighlight } from "../utils/curius-bridge";

// Import content CSS as inline string for shadow DOM injection
import contentCss from "../content-ui/content.css?inline";
import {
	isDomainDisabled,
	loadIndicatorCorner,
	saveIndicatorCorner,
} from "../content-ui/domain-settings";
import { ensureFontLoaded } from "../content-ui/font";
import {
	type GlossAppApi,
	type GlossAppCallbacks,
	GlossApp,
} from "../content-ui/gloss-app";
import {
	captureSelection,
	clearSavedSelection,
	getSavedSelector,
	getSavedText,
} from "../content-ui/selection-popover";
import {
	annotationsVisible,
	commentSummary,
	currentUserId,
	isAuthenticated,
	setAnnotationsVisible,
	setCommentSummary,
	setCurrentUserId,
	setHighlightCommentCounts,
	setIsAuthenticated,
	setManager,
	setUserSettings,
	userSettings,
} from "../content-ui/store";
import { generateId } from "../content-ui/utils";
import { OWN_HIGHLIGHT_COLOR, userHighlightColor } from "../utils/colors";
import { FeedDedup } from "../utils/feed-dedup";
import {
	type Comment,
	type Highlight as ServerHighlight,
	isErrorResponse,
	sendMessage,
} from "../utils/messages";
import { initThemeFor } from "../utils/theme";

// Storage key for user toggle state (persists manual toggle across pages)
const ANNOTATIONS_TOGGLED_KEY = "glossAnnotationsToggled";

async function loadAnnotationToggleState(): Promise<boolean | null> {
	try {
		const result = await browser.storage.sync.get(ANNOTATIONS_TOGGLED_KEY);
		const value = result[ANNOTATIONS_TOGGLED_KEY];
		return value === undefined ? null : value === true;
	} catch (error) {
		console.error("[Gloss] Failed to load annotation toggle state:", error);
		return null;
	}
}

async function saveAnnotationToggleState(visible: boolean): Promise<void> {
	try {
		await browser.storage.sync.set({ [ANNOTATIONS_TOGGLED_KEY]: visible });
	} catch (error) {
		console.error("[Gloss] Failed to save annotation toggle state:", error);
	}
}

async function loadUserSettingsFromServer(): Promise<void> {
	try {
		const response = await sendMessage({ type: "GET_USER_SETTINGS" });
		if (!isErrorResponse(response)) {
			setUserSettings(response.settings);
			console.log("[Gloss] User settings loaded:", response.settings);
		}
	} catch (error) {
		console.error("[Gloss] Failed to load user settings:", error);
	}
}

async function refreshAuthState(): Promise<void> {
	try {
		const response = await sendMessage({ type: "GET_AUTH_STATUS" });
		setIsAuthenticated(response.authenticated);
		setCurrentUserId(response.user?._id ?? null);
		console.log("[Gloss] Auth state:", {
			isAuthenticated: isAuthenticated(),
			currentUserId: currentUserId(),
		});
	} catch (error) {
		console.error("[Gloss] Failed to get auth status:", error);
		setIsAuthenticated(false);
		setCurrentUserId(null);
	}
}

export default defineContentScript({
	matches: ["<all_urls>"],
	runAt: "document_idle",
	async main(ctx) {
		// Register the curius.app token reader BEFORE the domain-disabled early
		// return. If a user disabled Gloss on curius.app specifically, we still
		// want the Connect flow to be able to lift the JWT. The read is
		// explicitly user-initiated from the popup/web onboarding.
		browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
			if (message?.type !== "CURIUS_READ_TOKEN") return;
			if (!/(^|\.)curius\.app$/i.test(location.hostname)) {
				sendResponse({ token: null });
				return false;
			}
			sendResponse({ token: readCuriusJwt() });
			return false;
		});

		// Opportunistic heartbeat: when a user who has already connected
		// Curius visits curius.app, push the current JWT up so our stored
		// copy stays fresh. Curius has no refresh endpoint (confirmed via
		// bundle inspection), so the only way we ever get a newer token is
		// when the user signs in again on curius.app — this catches that.
		if (/(^|\.)curius\.app$/i.test(location.hostname)) {
			void (async () => {
				try {
					const stored = await browser.storage.local.get("curius.connectedAt");
					if (typeof stored["curius.connectedAt"] !== "number") return;
					const token = readCuriusJwt();
					if (!token) return;
					await sendMessage({ type: "CURIUS_TOKEN_HEARTBEAT", token });
				} catch (error) {
					console.warn("[Gloss] Heartbeat send failed:", error);
				}
			})();
		}

		if (await isDomainDisabled()) {
			console.log("[Gloss] Disabled for this domain, skipping initialization");
			return;
		}

		console.log("[Gloss] Content script initialized", {
			url: location.href,
		});

		// Load the Satoshi font
		ensureFontLoaded();

		// Listen for messages from background script
		browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
			if (message.type === "GET_PAGE_METADATA") {
				import("../utils/metadata").then(({ extractPageMetadata }) => {
					const metadata = extractPageMetadata();
					sendResponse({ metadata });
					return undefined;
				});
				return true;
			}
		});

		// Fetch initial auth state and user settings
		await refreshAuthState();
		if (isAuthenticated()) {
			await loadUserSettingsFromServer();
		}

		// =====================================================================
		// Create highlight manager
		// =====================================================================

		// We need a reference to the app API, which is set after render
		let appApi: GlossAppApi | null = null;

		const manager = new HighlightManager({
			onEvent: (event) => {
				switch (event.type) {
					case "click": {
						const element = event.event.target as HTMLElement;
						handleHighlightClick(manager, event.highlightId, element);
						break;
					}
					case "anchored": {
						console.log(
							`[Gloss] Highlight anchored via ${event.method}:`,
							event.highlightId
						);
						break;
					}
					case "orphaned":
						console.log("[Gloss] Highlight orphaned:", event.highlightId);
						break;
					default:
						break;
				}
			},
		});

		setManager(manager);
		manager.observe();

		// =====================================================================
		// Create shadow DOM host and render Solid app
		// =====================================================================

		const host = document.createElement("div");
		host.id = "gloss-root";
		host.style.cssText =
			"all: initial; position: fixed; top: 0; left: 0; z-index: 2147483645; pointer-events: none;";
		const shadow = host.attachShadow({ mode: "open" });

		// Inject styles
		const style = document.createElement("style");
		style.textContent = contentCss;
		shadow.appendChild(style);

		// Container for Solid to render into
		const container = document.createElement("div");
		container.id = "gloss-container";
		shadow.appendChild(container);

		document.body.appendChild(host);

		// Sync theme class onto the container so CSS targeting
		// `#gloss-container.dark` kicks in. Driven by the shared
		// preference (popup / Convex sync) with a system-theme fallback.
		const disposeTheme = await initThemeFor(container);

		// Define callbacks
		const callbacks: GlossAppCallbacks = {
			onHighlight: async () => {
				await createHighlight(manager);
			},
			onSignIn: () => {
				browser.runtime.sendMessage({
					type: "OPEN_TAB",
					url: `${import.meta.env.VITE_WEB_URL || "http://localhost:3001"}/login`,
				});
			},
			onToggleAnnotations: async () => {
				setAnnotationsVisible(!annotationsVisible());
				await saveAnnotationToggleState(annotationsVisible());
			},
			onCornerChange: (corner) => {
				saveIndicatorCorner(corner);
			},
			onDisableDomain: () => {
				appApi?.hidePanel();
				setCommentSummary(null);
				setAnnotationsVisible(false);
				setHighlightCommentCounts(new Map());
				manager.clear();
			},
			onAnnotationClick: (highlightId, element) => {
				if (element) {
					handleHighlightClick(manager, highlightId, element);
				}
			},
			onCreateComment: async (content, mentions, parentId) => {
				const serverId = appApi?.panelServerId;
				if (!serverId) return;

				try {
					const response = await sendMessage({
						type: "CREATE_COMMENT",
						highlightId: serverId,
						content,
						mentions,
						parentId,
					});
					if (!isErrorResponse(response)) {
						console.log("[Gloss] Comment created:", response.comment._id);
						const commentsResp = await sendMessage({
							type: "LOAD_COMMENTS",
							highlightId: serverId,
						});
						if (!isErrorResponse(commentsResp)) {
							appApi?.setPanelComments(commentsResp.comments);
						}
					}
				} catch (error) {
					console.error("[Gloss] Error creating comment:", error);
				}
			},
			onDeleteComment: async (commentId) => {
				try {
					const response = await sendMessage({
						type: "DELETE_COMMENT",
						id: commentId,
					});
					if (!isErrorResponse(response)) {
						console.log("[Gloss] Comment deleted:", commentId);
						const highlightIds =
							commentSummary()?.highlightComments.map((hc) => hc.highlightId) ??
							[];
						if (highlightIds.length > 0) {
							await refreshCommentSummary(highlightIds);
						}
						const serverId = appApi?.panelServerId;
						if (serverId) {
							const commentsResp = await sendMessage({
								type: "LOAD_COMMENTS",
								highlightId: serverId,
							});
							if (!isErrorResponse(commentsResp)) {
								appApi?.setPanelComments(commentsResp.comments);
							}
						}
					}
				} catch (error) {
					console.error("[Gloss] Error deleting comment:", error);
				}
			},
			onDeleteHighlight: async () => {
				const highlightId = appApi?.panelHighlightId;
				const serverId = appApi?.panelServerId;
				if (!(highlightId && serverId)) return;

				try {
					manager.remove(highlightId);
					const response = await sendMessage({
						type: "DELETE_HIGHLIGHT",
						id: serverId,
					});
					if (isErrorResponse(response)) {
						console.error(
							"[Gloss] Failed to delete highlight:",
							response.error
						);
					} else {
						console.log("[Gloss] Highlight deleted");
						const highlightIds =
							commentSummary()
								?.highlightComments.map((hc) => hc.highlightId)
								.filter((id) => id !== serverId) ?? [];
						if (highlightIds.length > 0) {
							await refreshCommentSummary(highlightIds);
						} else {
							setCommentSummary(null);
						}
					}
				} catch (error) {
					console.error("[Gloss] Error deleting highlight:", error);
				}
			},
			onSearchFriends: async (query) => {
				try {
					const response = await sendMessage({
						type: "SEARCH_FRIENDS",
						query,
					});
					if (!isErrorResponse(response)) {
						appApi?.setMentionResults(response.friends);
					}
				} catch (error) {
					console.error("[Gloss] Error searching friends:", error);
				}
			},
			onPanelClosed: async () => {
				const highlightIds =
					commentSummary()?.highlightComments.map((hc) => hc.highlightId) ?? [];
				if (highlightIds.length > 0) {
					await refreshCommentSummary(highlightIds);
				}
			},
		};

		// Render the Solid app
		const dispose = render(
			() =>
				GlossApp({
					callbacks,
					apiRef: (api) => {
						appApi = api;
					},
				}),
			container
		);

		// =====================================================================
		// Selection handling
		// =====================================================================

		const handleMouseUp = (e: MouseEvent) => {
			setTimeout(() => {
				handleSelection(e);
			}, 10);
		};
		document.addEventListener("mouseup", handleMouseUp);

		// =====================================================================
		// Load initial data
		// =====================================================================

		void loadHighlights(manager).then(async (highlightIds) => {
			console.log("[Gloss] Highlights loaded");
			if (highlightIds.length > 0) {
				await loadCommentSummary(manager, highlightIds, appApi);
			}
			return undefined;
		});
		// Bridge layer: independent request, layered in as it arrives. Never
		// blocks or breaks the native flow.
		void loadCuriusBridge(manager);

		// =====================================================================
		// Navigation detection
		// =====================================================================

		let lastUrl = location.href;
		const navigationCheck = setInterval(() => {
			if (location.href !== lastUrl) {
				lastUrl = location.href;
				console.log("[Gloss] URL changed, reloading highlights");
				manager.clear();
				resetDedupState();
				appApi?.hidePopover();
				appApi?.hidePanel();
				setCommentSummary(null);
				setAnnotationsVisible(false);
				setHighlightCommentCounts(new Map());

				void loadHighlights(manager).then(async (highlightIds) => {
					if (highlightIds.length > 0) {
						await loadCommentSummary(manager, highlightIds, appApi);
					}
					return undefined;
				});
				void loadCuriusBridge(manager);
			}
		}, 500);

		// =====================================================================
		// Web ↔ extension bridge (for the settings page to control Curius)
		// =====================================================================
		//
		// The web app can't invoke Curius directly (CORS), and we don't use
		// `externally_connectable` because that would require knowing the
		// extension ID at build time. Instead, the web page posts messages
		// on `window`; this content script (which shares the page's window)
		// relays them to the background and posts responses back.
		//
		// Origin is tightly restricted to VITE_WEB_URL so no other site can
		// use this relay to disconnect a user's Curius account or trigger
		// imports.
		const webOrigin =
			(import.meta.env.VITE_WEB_URL as string | undefined) ??
			"http://localhost:3001";
		const handleWebMessage = (event: MessageEvent) => {
			if (event.source !== window) return;
			if (event.origin !== webOrigin) return;
			const data = event.data;
			if (
				!data ||
				typeof data !== "object" ||
				(data as { source?: unknown }).source !== "gloss-web"
			) {
				return;
			}
			const payload = data as {
				source: "gloss-web";
				type: "RUN_IMPORT" | "TOKEN_REVOKED" | "PING" | "START_CONNECT";
				requestId?: string;
			};

			const reply = (result: unknown) => {
				window.postMessage(
					{
						source: "gloss-ext",
						requestId: payload.requestId,
						type: payload.type,
						result,
					},
					webOrigin
				);
			};

			if (payload.type === "PING") {
				reply({ ok: true });
				return;
			}
			if (payload.type === "RUN_IMPORT") {
				void sendMessage({ type: "CURIUS_RUN_IMPORT" }).then(reply);
				return;
			}
			if (payload.type === "START_CONNECT") {
				void sendMessage({ type: "CURIUS_START_CONNECT" }).then(reply);
				return;
			}
			if (payload.type === "TOKEN_REVOKED") {
				// Web-initiated disconnect already dropped the Convex row; we
				// mirror by clearing the extension's cached JWT + caches.
				void sendMessage({ type: "CURIUS_DISCONNECT" }).then(reply);
				return;
			}
		};
		window.addEventListener("message", handleWebMessage);

		// =====================================================================
		// Cleanup
		// =====================================================================

		ctx.onInvalidated(() => {
			console.log("[Gloss] Content script invalidated, cleaning up");
			clearInterval(navigationCheck);
			document.removeEventListener("mouseup", handleMouseUp);
			window.removeEventListener("message", handleWebMessage);
			disposeTheme();
			dispose();
			host.remove();
			setManager(null);
			setCommentSummary(null);
			setHighlightCommentCounts(new Map());
			manager.destroy();
		});

		// =====================================================================
		// Helper functions (scoped to have access to appApi)
		// =====================================================================

		function handleSelection(e: MouseEvent): void {
			const selection = window.getSelection();

			if (!selection || selection.isCollapsed || !selection.toString().trim()) {
				appApi?.hidePopover();
				return;
			}

			const target = e.target as Element;
			if (
				target.closest(
					'input, textarea, [contenteditable="true"], .gloss-highlight'
				)
			) {
				appApi?.hidePopover();
				return;
			}

			// Ignore if inside our shadow DOM host
			if (target.closest("#gloss-root")) {
				return;
			}

			if (!captureSelection()) return;

			const range = selection.getRangeAt(0);
			const rect = range.getBoundingClientRect();

			appApi?.showPopover(rect);
		}

		async function handleHighlightClick(
			mgr: HighlightManager,
			highlightId: string,
			element: HTMLElement
		): Promise<void> {
			const active = mgr.get(highlightId);
			if (!active) {
				console.error("[Gloss] Highlight not found:", highlightId);
				return;
			}

			const highlightData = active.highlight;
			const userId = currentUserId();
			const isOwner =
				(highlightData.metadata?.userId as Id<"users"> | undefined) === userId;
			const serverId = (highlightData.metadata?.serverId ??
				highlightId) as Id<"highlights">;

			let comments: Comment[] = [];
			try {
				const response = await Promise.race([
					sendMessage({ type: "LOAD_COMMENTS", highlightId: serverId }),
					new Promise<{ error: string }>((_, reject) =>
						setTimeout(
							() => reject(new Error("Timeout loading comments")),
							5000
						)
					),
				]);
				if (!isErrorResponse(response)) {
					comments = response.comments;
				}
			} catch (error) {
				console.error("[Gloss] Error loading comments:", error);
			}

			appApi?.showPanel({
				highlight: active,
				element,
				isOwner,
				currentUserId: userId,
				comments,
				serverId,
				highlightId,
			});
		}
	},
});

// =============================================================================
// Standalone helper functions
// =============================================================================

/**
 * Read the Curius session JWT from the current page's localStorage.
 *
 * Curius stores the frontend-accessible JWT under the literal key `"jwt"`
 * (the httpOnly `token` cookie is inaccessible to scripts). We also keep a
 * JWT-shape fallback in case Curius rebrands the key — any value shaped like
 * `header.payload.signature` with a JSON header that has `alg`/`typ` counts.
 */
function readCuriusJwt(): string | null {
	try {
		const primary = window.localStorage.getItem("jwt");
		if (primary && looksLikeJwt(primary)) return primary;
		for (let i = 0; i < window.localStorage.length; i++) {
			const key = window.localStorage.key(i);
			if (!key) continue;
			const value = window.localStorage.getItem(key);
			if (value && looksLikeJwt(value)) return value;
		}
	} catch (error) {
		console.warn("[Gloss] Failed to read Curius JWT:", error);
	}
	return null;
}

function looksLikeJwt(value: string): boolean {
	const parts = value.split(".");
	if (parts.length !== 3) return false;
	try {
		const header = JSON.parse(
			atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"))
		);
		return (
			typeof header === "object" &&
			header !== null &&
			typeof header.alg === "string"
		);
	} catch {
		return false;
	}
}

async function refreshCommentSummary(
	highlightIds: Id<"highlights">[]
): Promise<void> {
	try {
		const response = await sendMessage({
			type: "LOAD_PAGE_COMMENT_SUMMARY",
			highlightIds,
		});
		if (!isErrorResponse(response)) {
			setCommentSummary(response);
			const counts = new Map<Id<"highlights">, number>();
			for (const hc of response.highlightComments) {
				counts.set(hc.highlightId, hc.comments.length);
			}
			setHighlightCommentCounts(counts);
		}
	} catch (error) {
		console.error("[Gloss] Error refreshing comment summary:", error);
	}
}

async function loadCommentSummary(
	manager: HighlightManager,
	highlightIds: Id<"highlights">[],
	appApi: GlossAppApi | null
): Promise<void> {
	try {
		const response = await sendMessage({
			type: "LOAD_PAGE_COMMENT_SUMMARY",
			highlightIds,
		});

		if (isErrorResponse(response)) {
			console.error("[Gloss] Failed to load comment summary:", response.error);
			return;
		}

		setCommentSummary(response);

		const counts = new Map<Id<"highlights">, number>();
		for (const hc of response.highlightComments) {
			counts.set(hc.highlightId, hc.comments.length);
		}
		setHighlightCommentCounts(counts);

		console.log(
			`[Gloss] Comment summary loaded: ${response.totalComments} comments from ${response.commenters.length} people`
		);

		if (response.totalComments > 0) {
			const settingDefault = userSettings()?.commentDisplayMode === "expanded";
			const manualToggle = await loadAnnotationToggleState();
			setAnnotationsVisible(
				manualToggle !== null ? manualToggle : settingDefault
			);

			const anchoredHighlightCount = response.highlightComments.filter((hc) => {
				const active = manager.get(hc.highlightId);
				return active && active.elements.length > 0;
			}).length;

			const savedCorner = await loadIndicatorCorner();

			appApi?.setAnchoredHighlightCount(anchoredHighlightCount);
			appApi?.setIndicatorCorner(savedCorner);
		}
	} catch (error) {
		console.error("[Gloss] Error loading comment summary:", error);
	}
}

async function createHighlight(manager: HighlightManager): Promise<void> {
	const selector = getSavedSelector();
	const text = getSavedText();

	if (!(selector && text)) {
		console.error("[Gloss] No saved selection to highlight");
		return;
	}

	if (!text.trim()) {
		console.error("[Gloss] Saved selection text is empty");
		clearSavedSelection();
		return;
	}

	const id = generateId();

	try {
		const highlight: Highlight = {
			id,
			selector,
			color: OWN_HIGHLIGHT_COLOR,
			metadata: { userId: currentUserId() },
		};
		manager.add(highlight);
		clearSavedSelection();

		console.log("[Gloss] Created highlight:", {
			id,
			text: text.slice(0, 50),
		});

		const selection = window.getSelection();
		if (selection) selection.removeAllRanges();

		const response = await sendMessage({
			type: "CREATE_HIGHLIGHT",
			url: location.href,
			selector,
			text,
		});

		if (isErrorResponse(response)) {
			console.error(
				"[Gloss] Failed to save highlight:",
				JSON.stringify(response)
			);
			manager.remove(id);
			return;
		}

		console.log("[Gloss] Highlight saved:", response.highlight?._id);

		const active = manager.get(id);
		if (active && response.highlight) {
			active.highlight.metadata = {
				...active.highlight.metadata,
				serverId: response.highlight._id,
			};
		}
	} catch (error) {
		console.error("[Gloss] Error creating highlight:", error);
		manager.remove(id);
	}
}

function toHighlight(serverHighlight: ServerHighlight): Highlight {
	const userId = currentUserId();
	const isOwnHighlight = serverHighlight.userId === userId;
	const color = isOwnHighlight
		? OWN_HIGHLIGHT_COLOR
		: userHighlightColor(serverHighlight.user?.name ?? "Friend");

	return {
		id: serverHighlight._id,
		selector: serverHighlight.selector as Highlight["selector"],
		color,
		metadata: {
			userId: serverHighlight.userId,
			serverId: serverHighlight._id,
			userName: serverHighlight.user?.name,
			userImage: serverHighlight.user?.image,
			text: serverHighlight.text,
			visibility: serverHighlight.visibility,
			createdAt: serverHighlight._creationTime,
			externalId: serverHighlight.externalId,
			importSource: serverHighlight.importSource,
		},
	};
}

/**
 * Bridge/native dedup state, scoped to one page view. Reset on SPA nav.
 * See `FeedDedup` for the detailed contract — this module just owns the
 * singleton instance.
 */
const feedDedup = new FeedDedup();

function resetDedupState(): void {
	feedDedup.reset();
}

function bridgeHighlightId(externalId: string): string {
	return `curius:${externalId}`;
}

function toBridgedHighlight(bh: BridgeHighlight): Highlight {
	const displayName = `${bh.user.firstName} ${bh.user.lastName}`.trim();
	return {
		id: bridgeHighlightId(bh.externalId),
		selector: bh.selector as Highlight["selector"],
		color: userHighlightColor(bh.user.firstName),
		metadata: {
			userId: bh.user.glossUserId ?? null,
			userName: displayName,
			curiusUserId: bh.user.curiusUserId,
			curiusUserLink: bh.user.curiusUserLink,
			text: bh.text,
			externalId: bh.externalId,
			source: "curius",
		},
	};
}

async function loadHighlights(
	manager: HighlightManager
): Promise<Id<"highlights">[]> {
	const url = location.href;

	try {
		const response = await sendMessage({ type: "LOAD_HIGHLIGHTS", url });

		if (isErrorResponse(response)) {
			console.error("[Gloss] Failed to load highlights:", response.error);
			return [];
		}

		const { highlights } = response;
		console.log(`[Gloss] Loading ${highlights.length} highlights for ${url}`);

		// Native-wins: before adding a native highlight, remove any bridge
		// copy on screen for the same externalId.
		for (const sh of highlights) {
			feedDedup.onNativeHighlight(sh.externalId, manager);
		}

		const converted = highlights.map(toHighlight);
		const results = manager.load(converted);

		let anchored = 0;
		let orphaned = 0;
		const loadedIds: Id<"highlights">[] = [];
		for (const [id, success] of results.entries()) {
			if (success) {
				anchored++;
				loadedIds.push(id as Id<"highlights">);
			} else {
				orphaned++;
			}
		}

		console.log(
			`[Gloss] Highlights loaded: ${anchored} anchored, ${orphaned} orphaned`
		);

		return loadedIds;
	} catch (error) {
		console.error("[Gloss] Error loading highlights:", error);
		return [];
	}
}

async function loadCuriusBridge(manager: HighlightManager): Promise<void> {
	const url = location.href;

	try {
		const response = await sendMessage({ type: "LOAD_CURIUS_BRIDGE", url });

		if (isErrorResponse(response)) {
			console.warn("[Gloss] Curius bridge error:", response.error);
			return;
		}

		const { highlights } = response;
		if (highlights.length === 0) return;

		// Native-wins: skip any bridge highlight whose externalId is already
		// covered by a native row. If native arrives later for this same
		// externalId, loadHighlights tears down the bridge copy.
		const toAdd: Highlight[] = [];
		for (const bh of highlights) {
			const bridgeId = bridgeHighlightId(bh.externalId);
			if (!feedDedup.shouldRenderBridge(bh.externalId, bridgeId)) continue;
			toAdd.push(toBridgedHighlight(bh));
		}

		if (toAdd.length === 0) return;

		console.log(
			`[Gloss] Layering ${toAdd.length} Curius bridge highlights for ${url}`
		);
		manager.load(toAdd);
	} catch (error) {
		console.error("[Gloss] Error loading Curius bridge:", error);
	}
}
