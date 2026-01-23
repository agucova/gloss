import type { AnnotationSelector } from "@gloss/anchoring";

/**
 * Server-returned highlight shape (from API response).
 * Matches the shape returned by GET /api/highlights
 */
export interface ServerHighlight {
	id: string;
	userId: string;
	url: string;
	urlHash: string;
	selector: AnnotationSelector;
	text: string;
	note: string | null;
	color: string;
	visibility: "public" | "friends" | "private";
	createdAt: string;
	user?: {
		id: string;
		name: string | null;
		image: string | null;
	};
}

/**
 * Server-returned comment shape (from API response).
 */
export interface ServerComment {
	id: string;
	highlightId: string;
	authorId: string;
	content: string;
	createdAt: string;
	updatedAt: string;
	author: {
		id: string;
		name: string | null;
		image: string | null;
	};
	mentions: Array<{
		mentionedUser: {
			id: string;
			name: string | null;
		};
	}>;
}

/**
 * Friend for @mention autocomplete.
 */
export interface Friend {
	id: string;
	name: string | null;
	image: string | null;
}

/**
 * Message types for content ↔ background communication.
 */
export type Message =
	| { type: "LOAD_HIGHLIGHTS"; url: string }
	| {
			type: "CREATE_HIGHLIGHT";
			url: string;
			selector: AnnotationSelector;
			text: string;
			color?: string;
			visibility?: "public" | "friends" | "private";
	  }
	| {
			type: "UPDATE_HIGHLIGHT";
			id: string;
			updates: {
				color?: string;
				note?: string;
				visibility?: "public" | "friends" | "private";
			};
	  }
	| { type: "DELETE_HIGHLIGHT"; id: string }
	| { type: "GET_AUTH_STATUS" }
	| { type: "GET_RECENT_HIGHLIGHTS"; limit?: number }
	// Comment messages
	| { type: "LOAD_COMMENTS"; highlightId: string }
	| {
			type: "CREATE_COMMENT";
			highlightId: string;
			content: string;
			mentions: string[];
	  }
	| {
			type: "UPDATE_COMMENT";
			id: string;
			content: string;
			mentions: string[];
	  }
	| { type: "DELETE_COMMENT"; id: string }
	| { type: "SEARCH_FRIENDS"; query: string };

/**
 * Response types mapped to each message type.
 */
export type MessageResponse<T extends Message["type"]> =
	T extends "LOAD_HIGHLIGHTS"
		? { highlights: ServerHighlight[] } | { error: string }
		: T extends "CREATE_HIGHLIGHT"
			? { highlight: ServerHighlight } | { error: string }
			: T extends "UPDATE_HIGHLIGHT"
				? { highlight: ServerHighlight } | { error: string }
				: T extends "DELETE_HIGHLIGHT"
					? { success: boolean } | { error: string }
					: T extends "GET_AUTH_STATUS"
						? {
								authenticated: boolean;
								user?: { id: string; name: string | null };
							}
						: T extends "GET_RECENT_HIGHLIGHTS"
							? { highlights: ServerHighlight[] } | { error: string }
							: T extends "LOAD_COMMENTS"
								? { comments: ServerComment[] } | { error: string }
								: T extends "CREATE_COMMENT"
									? { comment: ServerComment } | { error: string }
									: T extends "UPDATE_COMMENT"
										? { comment: ServerComment } | { error: string }
										: T extends "DELETE_COMMENT"
											? { success: boolean } | { error: string }
											: T extends "SEARCH_FRIENDS"
												? { friends: Friend[] } | { error: string }
												: never;

/**
 * Type-safe message sending helper.
 * Use this in content scripts to communicate with the background script.
 */
export async function sendMessage<T extends Message>(
	message: T
): Promise<MessageResponse<T["type"]>> {
	return await browser.runtime.sendMessage(message);
}

/**
 * Type guard for checking if a response is an error.
 */
export function isErrorResponse(
	response: { error: string } | unknown
): response is { error: string } {
	return (
		typeof response === "object" &&
		response !== null &&
		"error" in response &&
		typeof (response as { error: unknown }).error === "string"
	);
}
