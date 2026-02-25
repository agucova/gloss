import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { CuriusClient } from "./client";
import {
	CuriusAuthError,
	CuriusError,
	CuriusNotFoundError,
	CuriusRateLimitError,
	CuriusValidationError,
} from "./errors";

describe("CuriusClient", () => {
	let client: CuriusClient;
	let fetchSpy: ReturnType<typeof spyOn>;

	function mockFetchResponse(
		body: unknown,
		options: { status?: number; headers?: Record<string, string> } = {}
	) {
		const { status = 200, headers = {} } = options;
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json", ...headers },
			})
		);
	}

	function mockFetchError(
		status: number,
		body?: unknown,
		headers?: Record<string, string>
	) {
		fetchSpy.mockResolvedValueOnce(
			new Response(body ? JSON.stringify(body) : null, {
				status,
				headers: headers ?? {},
			})
		);
	}

	// Setup fresh client and spy for each test
	beforeEach(() => {
		client = new CuriusClient({ token: "test-token-123" });
		fetchSpy = spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	// =========================================================================
	// User endpoints
	// =========================================================================

	describe("getUser", () => {
		test("returns user data on success", async () => {
			const mockUser = {
				id: "user-123",
				firstName: "Test",
				lastName: "User",
				userLink: "testuser",
			};
			mockFetchResponse({ user: mockUser });

			const user = await client.getUser();

			expect(user.id).toBe("user-123");
			expect(user.firstName).toBe("Test");
			expect(user.lastName).toBe("User");
			expect(user.userLink).toBe("testuser");
		});

		test("throws CuriusAuthError on 401", async () => {
			mockFetchError(401);

			await expect(client.getUser()).rejects.toThrow(CuriusAuthError);
		});

		test("throws CuriusValidationError on invalid response", async () => {
			mockFetchResponse({ invalid: "data" }); // Missing required fields

			await expect(client.getUser()).rejects.toThrow(CuriusValidationError);
		});

		test("sends correct authorization header", async () => {
			const mockUser = {
				id: "user-123",
				firstName: "Test",
				lastName: "User",
				userLink: "testuser",
			};
			mockFetchResponse({ user: mockUser });

			await client.getUser();

			expect(fetchSpy).toHaveBeenCalledWith(
				"https://curius.app/api/user",
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: "Bearer test-token-123",
					}),
				})
			);
		});
	});

	describe("getFollowing", () => {
		test("returns array of users", async () => {
			const mockResponse = {
				following: [
					{
						id: "user-1",
						firstName: "Alice",
						lastName: "Smith",
						userLink: "alice",
					},
					{
						id: "user-2",
						firstName: "Bob",
						lastName: "Jones",
						userLink: "bob",
					},
				],
			};
			mockFetchResponse(mockResponse);

			const following = await client.getFollowing();

			expect(following).toHaveLength(2);
			expect(following[0]?.firstName).toBe("Alice");
			expect(following[1]?.firstName).toBe("Bob");
		});
	});

	// =========================================================================
	// Link endpoints
	// =========================================================================

	describe("getUserLinks", () => {
		test("fetches user ID then requests /api/users/:id/links", async () => {
			// First call: getUser to get the user ID
			mockFetchResponse({
				user: {
					id: "42",
					firstName: "Test",
					lastName: "User",
					userLink: "test",
				},
			});
			// Second call: getUserLinks
			mockFetchResponse({
				userSaved: [
					{
						id: "link-1",
						link: "https://example.com",
						highlights: [],
						nHighlights: 0,
					},
				],
			});

			const links = await client.getUserLinks();

			expect(links).toHaveLength(1);
			expect(links[0]?.id).toBe("link-1");
			expect(fetchSpy).toHaveBeenCalledWith(
				"https://curius.app/api/users/42/links",
				expect.anything()
			);
		});

		test("caches user ID for subsequent calls", async () => {
			// First call gets user
			mockFetchResponse({
				user: {
					id: "42",
					firstName: "Test",
					lastName: "User",
					userLink: "test",
				},
			});
			mockFetchResponse({ userSaved: [] });
			await client.getUserLinks();

			// Second call should NOT fetch user again
			mockFetchResponse({ userSaved: [] });
			await client.getUserLinks();

			// getUser called once, getUserLinks called twice = 3 total
			expect(fetchSpy).toHaveBeenCalledTimes(3);
		});
	});

	describe("addLink", () => {
		test("creates a link successfully", async () => {
			const mockResponse = {
				link: {
					id: "link-123",
					link: "https://example.com",
					title: "Example Site",
					snippet: "Some text",
					highlights: [],
					nHighlights: 0,
				},
			};
			mockFetchResponse(mockResponse);

			const link = await client.addLink({
				url: "https://example.com",
				title: "Example Site",
				snippet: "Some text",
			});

			expect(link.id).toBe("link-123");
		});

		test("sends correct nested request body", async () => {
			mockFetchResponse({
				link: {
					id: "link-123",
					link: "https://example.com",
					title: "My Title",
					snippet: "Text",
					highlights: [],
					nHighlights: 0,
				},
			});

			await client.addLink({
				url: "https://example.com",
				title: "My Title",
				snippet: "Text",
			});

			expect(fetchSpy).toHaveBeenCalledWith(
				"https://curius.app/api/links",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({
						link: {
							link: "https://example.com",
							title: "My Title",
							snippet: "Text",
							classify: false,
						},
					}),
				})
			);
		});
	});

	describe("getLinkByUrl", () => {
		test("returns link when found", async () => {
			const mockLink = {
				id: "link-123",
				url: "https://example.com",
				highlights: [],
				nHighlights: 0,
			};
			mockFetchResponse({ link: mockLink });

			const link = await client.getLinkByUrl("https://example.com");

			expect(link).not.toBeNull();
			expect(link?.id).toBe("link-123");
		});

		test("returns null when API returns empty object", async () => {
			mockFetchResponse({});

			const link = await client.getLinkByUrl("https://notfound.com");

			expect(link).toBeNull();
		});

		test("returns null when API returns 404", async () => {
			mockFetchError(404);

			const link = await client.getLinkByUrl("https://notfound.com");

			expect(link).toBeNull();
		});
	});

	describe("getNetworkInfo", () => {
		test("returns network info with users and highlights", async () => {
			const mockResponse = {
				networkInfo: {
					id: 123,
					link: "https://example.com",
					title: "Example Page",
					users: [
						{
							id: 1,
							firstName: "Alice",
							lastName: "Smith",
							userLink: "alice",
						},
					],
					highlights: [
						[
							{
								id: 456,
								userId: 1,
								linkId: 123,
								highlight: "Some text",
							},
						],
					],
				},
			};
			mockFetchResponse(mockResponse);

			const info = await client.getNetworkInfo("https://example.com");

			expect(info).not.toBeNull();
			expect(info!.users).toHaveLength(1);
			expect(info!.users[0]?.firstName).toBe("Alice");
			expect(info!.highlights).toHaveLength(1);
		});

		test("returns null when API returns empty object", async () => {
			mockFetchResponse({});

			const info = await client.getNetworkInfo("https://example.com");

			expect(info).toBeNull();
		});
	});

	describe("deleteLink", () => {
		test("calls correct endpoint", async () => {
			mockFetchResponse({});

			await client.deleteLink("link-123");

			expect(fetchSpy).toHaveBeenCalledWith(
				"https://curius.app/api/links/link-123",
				expect.objectContaining({ method: "DELETE" })
			);
		});
	});

	// =========================================================================
	// Highlight endpoints
	// =========================================================================

	describe("addHighlight", () => {
		test("sends highlight with flat {highlightText, rawHighlight, leftContext, rightContext}", async () => {
			mockFetchResponse({ success: true });

			const position = {
				rawHighlight: "Selected text",
				leftContext: "before ",
				rightContext: " after",
			};

			await client.addHighlight("link-123", position);

			expect(fetchSpy).toHaveBeenCalledWith(
				"https://curius.app/api/links/link-123/highlights",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({
						highlight: {
							highlightText: "Selected text",
							rawHighlight: "Selected text",
							leftContext: "before ",
							rightContext: " after",
						},
					}),
				})
			);
		});
	});

	describe("deleteHighlight", () => {
		test("sends highlight text in body", async () => {
			mockFetchResponse({});

			await client.deleteHighlight("link-123", "text to delete");

			expect(fetchSpy).toHaveBeenCalledWith(
				"https://curius.app/api/links/link-123/highlights",
				expect.objectContaining({
					method: "DELETE",
					body: JSON.stringify({ highlightText: "text to delete" }),
				})
			);
		});
	});

	// =========================================================================
	// Error handling
	// =========================================================================

	describe("error handling", () => {
		test("throws CuriusAuthError on 401", async () => {
			mockFetchError(401);

			await expect(client.getUser()).rejects.toThrow(CuriusAuthError);
		});

		test("throws CuriusNotFoundError on 404", async () => {
			mockFetchError(404);

			await expect(client.deleteLink("nonexistent")).rejects.toThrow(
				CuriusNotFoundError
			);
		});

		test("throws CuriusRateLimitError on 429 with retry-after", async () => {
			mockFetchError(429, null, { "Retry-After": "60" });

			try {
				await client.getUser();
				expect.unreachable("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(CuriusRateLimitError);
				expect((error as CuriusRateLimitError).retryAfter).toBe(60);
			}
		});

		test("throws CuriusError on other status codes", async () => {
			mockFetchError(500, { error: "Internal server error" });

			try {
				await client.getUser();
				expect.unreachable("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(CuriusError);
				expect((error as CuriusError).statusCode).toBe(500);
			}
		});

		test("extracts error message from response body", async () => {
			mockFetchError(400, { error: "Custom error message" });

			try {
				await client.addLink({ url: "invalid", title: "t", snippet: "s" });
				expect.unreachable("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(CuriusError);
				expect((error as CuriusError).message).toBe("Custom error message");
			}
		});
	});

	// =========================================================================
	// Utility methods
	// =========================================================================

	describe("verifyToken", () => {
		test("returns true for valid token", async () => {
			mockFetchResponse({
				user: {
					id: "user-123",
					firstName: "Test",
					lastName: "User",
					userLink: "test",
				},
			});

			const isValid = await client.verifyToken();

			expect(isValid).toBe(true);
		});

		test("returns false for invalid token (401)", async () => {
			mockFetchError(401);

			const isValid = await client.verifyToken();

			expect(isValid).toBe(false);
		});

		test("returns false for malformed token (400 with token error)", async () => {
			mockFetchError(400, { error: "Token error: jwt malformed" });

			const isValid = await client.verifyToken();

			expect(isValid).toBe(false);
		});

		test("throws on other errors", async () => {
			mockFetchError(500);

			await expect(client.verifyToken()).rejects.toThrow(CuriusError);
		});
	});

	// =========================================================================
	// Configuration
	// =========================================================================

	describe("configuration", () => {
		test("uses custom base URL", async () => {
			const customClient = new CuriusClient({
				token: "test",
				baseUrl: "https://custom.curius.app",
			});
			mockFetchResponse({
				user: {
					id: "user-123",
					firstName: "Test",
					lastName: "User",
					userLink: "test",
				},
			});

			await customClient.getUser();

			expect(fetchSpy).toHaveBeenCalledWith(
				"https://custom.curius.app/api/user",
				expect.anything()
			);
		});
	});
});
