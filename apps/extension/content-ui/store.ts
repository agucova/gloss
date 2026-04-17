/**
 * Reactive store for content script state using Solid signals.
 * Components read via getter calls — Solid tracks dependencies automatically.
 */

import type { HighlightManager } from "@gloss/anchoring";

import { createSignal } from "solid-js";

import type { Id } from "../../../convex/_generated/dataModel";
import type { PageCommentSummary, UserSettings } from "../utils/messages";

export const [isAuthenticated, setIsAuthenticated] = createSignal(false);
export const [currentUserId, setCurrentUserId] =
	createSignal<Id<"users"> | null>(null);
export const [userSettings, setUserSettings] =
	createSignal<UserSettings | null>(null);
export const [commentSummary, setCommentSummary] =
	createSignal<PageCommentSummary | null>(null);
export const [annotationsVisible, setAnnotationsVisible] = createSignal(false);
export const [highlightCommentCounts, setHighlightCommentCounts] = createSignal(
	new Map<Id<"highlights">, number>()
);
export const [manager, setManager] = createSignal<HighlightManager | null>(
	null
);
