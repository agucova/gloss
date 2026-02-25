import type { Elysia } from "elysia";

/**
 * Test setup utilities for Gloss API tests.
 *
 * Uses Elysia's .handle() method for direct request testing (no HTTP server needed).
 * Auth is mocked by injecting session data via a custom header that the test
 * auth middleware reads instead of calling better-auth.
 */
import { db } from "@gloss/db";
import {
	apiKey,
	bookmark,
	comment,
	friendship,
	highlight,
	tag,
	user,
} from "@gloss/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";

/**
 * Header used to pass mock session data in tests.
 * The test app's auth middleware reads this instead of calling better-auth.
 */
export const TEST_AUTH_HEADER = "x-test-auth";

/**
 * Response with .json() typed as `any` instead of bun's strict `unknown`.
 * Avoids TS18046 noise on every `await res.json()` in test assertions.
 */
export interface TestResponse extends Response {
	json(): Promise<any>;
}

/**
 * Represents a test user with all fields needed for auth context.
 */
export interface TestUser {
	id: string;
	name: string;
	email: string;
	image: string | null;
}

/**
 * Create a test user in the database.
 * Returns a TestUser object that can be used with authenticatedRequest().
 */
export async function createTestUser(
	overrides: Partial<TestUser> = {}
): Promise<TestUser> {
	const id = overrides.id ?? `test_${createId()}`;
	const name = overrides.name ?? `Test User ${id.slice(-6)}`;
	const email = overrides.email ?? `${id}@test.gloss.dev`;
	const image = overrides.image ?? null;

	await db.insert(user).values({
		id,
		name,
		email,
		emailVerified: true,
		image,
	});

	return { id, name, email, image };
}

/**
 * Create a friendship between two users (already accepted).
 */
export async function createTestFriendship(
	userId1: string,
	userId2: string
): Promise<string> {
	const id = createId();
	await db.insert(friendship).values({
		id,
		requesterId: userId1,
		addresseeId: userId2,
		status: "accepted",
	});
	return id;
}

/**
 * Build the auth header value for a test user.
 * Pass this as the x-test-auth header to authenticate requests.
 */
export function authHeaderFor(testUser: TestUser): string {
	return JSON.stringify({
		user: { id: testUser.id, name: testUser.name, email: testUser.email },
	});
}

/**
 * Make a request to the test app with authentication.
 */
export function authenticatedRequest(
	app: Elysia<any, any, any, any, any, any, any>,
	method: string,
	path: string,
	testUser: TestUser,
	options: {
		body?: unknown;
		query?: Record<string, string>;
		headers?: Record<string, string>;
	} = {}
): Promise<TestResponse> {
	const url = new URL(path, "http://localhost");
	if (options.query) {
		for (const [key, value] of Object.entries(options.query)) {
			url.searchParams.set(key, value);
		}
	}

	const headers: Record<string, string> = {
		[TEST_AUTH_HEADER]: authHeaderFor(testUser),
		...options.headers,
	};

	const init: RequestInit = {
		method,
		headers,
	};

	if (options.body !== undefined) {
		headers["Content-Type"] = "application/json";
		init.body = JSON.stringify(options.body);
	}

	init.headers = headers;
	return app.handle(new Request(url.toString(), init));
}

/**
 * Make an unauthenticated request to the test app.
 */
export function unauthenticatedRequest(
	app: Elysia<any, any, any, any, any, any, any>,
	method: string,
	path: string,
	options: {
		body?: unknown;
		query?: Record<string, string>;
		headers?: Record<string, string>;
	} = {}
): Promise<TestResponse> {
	const url = new URL(path, "http://localhost");
	if (options.query) {
		for (const [key, value] of Object.entries(options.query)) {
			url.searchParams.set(key, value);
		}
	}

	const headers: Record<string, string> = {
		...options.headers,
	};

	const init: RequestInit = {
		method,
		headers,
	};

	if (options.body !== undefined) {
		headers["Content-Type"] = "application/json";
		init.body = JSON.stringify(options.body);
	}

	init.headers = headers;
	return app.handle(new Request(url.toString(), init));
}

/**
 * Clean up test data from the database.
 * Removes all data created by test users.
 * Call this in afterEach/afterAll to keep the database clean.
 */
export async function cleanupTestUser(userId: string): Promise<void> {
	// Delete in dependency order (foreign keys)
	// search_index may not exist in dev; ignore errors
	try {
		await db.execute(sql`DELETE FROM search_index WHERE user_id = ${userId}`);
	} catch {
		// Table may not exist, safe to ignore
	}
	await db.delete(comment).where(eq(comment.authorId, userId));
	await db.delete(highlight).where(eq(highlight.userId, userId));
	await db.delete(tag).where(eq(tag.userId, userId));
	await db.delete(apiKey).where(eq(apiKey.userId, userId));
	await db.delete(bookmark).where(eq(bookmark.userId, userId));
	await db.delete(friendship).where(eq(friendship.requesterId, userId));
	await db.delete(friendship).where(eq(friendship.addresseeId, userId));
	await db.delete(user).where(eq(user.id, userId));
}

/**
 * A valid selector object matching the SelectorSchema.
 */
export const VALID_SELECTOR = {
	range: {
		type: "RangeSelector" as const,
		startContainer: "/html/body/div/p[1]",
		startOffset: 10,
		endContainer: "/html/body/div/p[1]",
		endOffset: 50,
	},
	position: {
		type: "TextPositionSelector" as const,
		start: 100,
		end: 150,
	},
	quote: {
		type: "TextQuoteSelector" as const,
		exact: "highlighted text content",
		prefix: "some prefix text ",
		suffix: " some suffix text",
	},
};
