import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate config to a fresh temp dir so the test run doesn't pick up the
// developer's real ~/.config/gloss/config.json.
const TMP_CONFIG = mkdtempSync(join(tmpdir(), "gloss-cli-test-"));
process.env.XDG_CONFIG_HOME = TMP_CONFIG;

import {
	ApiError,
	getCurrentUser,
	listBookmarks,
	listHighlights,
	listTags,
	search,
} from "./api-client";

const ORIGINAL_FETCH = globalThis.fetch;
let lastRequest: { url: string; init?: RequestInit } | null = null;

function setMockFetch(response: {
	status?: number;
	body: unknown;
	statusText?: string;
}) {
	globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
		lastRequest = { url: url.toString(), init };
		return new Response(JSON.stringify(response.body), {
			status: response.status ?? 200,
			statusText: response.statusText,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof globalThis.fetch;
}

beforeEach(() => {
	process.env.GLOSS_API_KEY = "gloss_sk_testkey";
	process.env.GLOSS_API_URL = "https://example.test";
	lastRequest = null;
});

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
	delete process.env.GLOSS_API_KEY;
	delete process.env.GLOSS_API_URL;
});

describe("api-client authentication", () => {
	test("attaches Bearer header on every request", async () => {
		setMockFetch({ body: { items: [], nextCursor: null } });
		await listHighlights();

		const headers = lastRequest?.init?.headers as Headers;
		expect(headers.get("Authorization")).toBe("Bearer gloss_sk_testkey");
		expect(headers.get("Content-Type")).toBe("application/json");
	});

	test("throws ApiError with status + message on non-2xx responses", async () => {
		setMockFetch({
			status: 401,
			statusText: "Unauthorized",
			body: { error: "Bad API key" },
		});

		try {
			await listHighlights();
			throw new Error("expected listHighlights to reject");
		} catch (err) {
			expect(err).toBeInstanceOf(ApiError);
			expect((err as ApiError).status).toBe(401);
			expect((err as Error).message).toBe("Bad API key");
		}
	});

	test("throws ApiError when no API key is configured", async () => {
		delete process.env.GLOSS_API_KEY;
		globalThis.fetch = mock(async () => {
			throw new Error("should not be called");
		}) as unknown as typeof globalThis.fetch;

		try {
			await listHighlights();
			throw new Error("expected listHighlights to reject");
		} catch (err) {
			expect(err).toBeInstanceOf(ApiError);
			expect((err as ApiError).status).toBe(401);
			expect((err as Error).message).toMatch(/gloss auth login/);
		}
	});
});

describe("URL construction", () => {
	test("search serializes all filter params", async () => {
		setMockFetch({
			body: {
				results: [],
				meta: {
					query: "react",
					mode: "fts",
					semanticSearchUsed: false,
					total: 0,
					limit: 10,
					offset: 0,
					sortBy: "created",
				},
			},
		});

		await search({
			query: "react",
			types: ["highlight", "bookmark"],
			tagName: "to-read",
			domain: "arxiv.org",
			after: "2024-01-01",
			before: "2025-01-01",
			sortBy: "created",
			limit: 10,
		});

		const url = new URL(lastRequest!.url);
		expect(url.origin + url.pathname).toBe("https://example.test/api/search");
		expect(url.searchParams.get("q")).toBe("react");
		expect(url.searchParams.get("types")).toBe("highlight,bookmark");
		expect(url.searchParams.get("tagName")).toBe("to-read");
		expect(url.searchParams.get("domain")).toBe("arxiv.org");
		expect(url.searchParams.get("after")).toBe("2024-01-01");
		expect(url.searchParams.get("before")).toBe("2025-01-01");
		expect(url.searchParams.get("sortBy")).toBe("created");
		expect(url.searchParams.get("limit")).toBe("10");
	});

	test("listHighlights hits /api/highlights/mine with limit", async () => {
		setMockFetch({ body: { items: [], nextCursor: null } });
		await listHighlights({ limit: 25 });

		const url = new URL(lastRequest!.url);
		expect(url.pathname).toBe("/api/highlights/mine");
		expect(url.searchParams.get("limit")).toBe("25");
	});

	test("listBookmarks hits /api/bookmarks", async () => {
		setMockFetch({ body: { items: [], nextCursor: null } });
		await listBookmarks();

		const url = new URL(lastRequest!.url);
		expect(url.pathname).toBe("/api/bookmarks");
	});

	test("listTags hits /api/bookmarks/tags", async () => {
		setMockFetch({ body: { tags: [] } });
		await listTags(25);

		const url = new URL(lastRequest!.url);
		expect(url.pathname).toBe("/api/bookmarks/tags");
		expect(url.searchParams.get("limit")).toBe("25");
	});

	test("getCurrentUser hits /api/users/me", async () => {
		setMockFetch({
			body: {
				id: "u1",
				name: "Test",
				email: "test@example.com",
				image: null,
			},
		});
		const user = await getCurrentUser();

		const url = new URL(lastRequest!.url);
		expect(url.pathname).toBe("/api/users/me");
		expect(user.email).toBe("test@example.com");
	});
});
