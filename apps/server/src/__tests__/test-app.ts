/**
 * Creates a test Elysia app with mocked authentication.
 *
 * Uses bun:test's mock.module() to intercept @gloss/auth so that
 * auth.api.getSession() reads from the x-test-auth header instead
 * of requiring real session cookies.
 *
 * IMPORTANT: This file must be imported BEFORE any route modules to
 * ensure the mock is in place.
 */
import { mock } from "bun:test";

import { TEST_AUTH_HEADER } from "./setup";

/**
 * Mock @gloss/auth to use our test auth header.
 * This intercepts all imports of @gloss/auth throughout the dependency tree,
 * including inside route handlers that call auth.api.getSession().
 */
/**
 * Mock embeddings to avoid external OpenAI API calls in tests.
 * Without this, fire-and-forget embedding generation can cause
 * intermittent failures from vector dimension mismatches.
 */
mock.module("@gloss/api/lib/embeddings", () => ({
	EMBEDDING_DIMENSION: 1536,
	generateEmbedding: async () => null,
	generateEmbeddings: async (texts: string[]) => texts.map(() => null),
	isSemanticSearchAvailable: () => false,
}));

mock.module("@gloss/auth", () => ({
	auth: {
		api: {
			getSession: async ({ headers }: { headers: Headers }) => {
				const testAuth = headers.get(TEST_AUTH_HEADER);
				if (!testAuth) {
					return null;
				}
				try {
					return JSON.parse(testAuth);
				} catch {
					return null;
				}
			},
		},
		handler: async () =>
			new Response("Not implemented in tests", { status: 501 }),
	},
}));

// Import the app after mocks are in place
import { api } from "@gloss/api";
import { Elysia } from "elysia";

/**
 * Create a test Elysia app that mirrors the real server's API routes
 * but with mocked auth.
 *
 * Routes are mounted under /api (same as production).
 * Use app.handle() to make requests without starting an HTTP server.
 */
export function createTestApp() {
	return new Elysia().use(api).get("/", () => "OK");
}
