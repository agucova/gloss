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
		fetchSpy.mockResolvedValue(
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
		fetchSpy.mockResolvedValue(
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

	describe("addLink", () => {
		test("creates a link successfully", async () => {
			const mockLink = {
				id: "link-123",
				url: "https://example.com",
				title: "Example Site",
				highlights: [],
				nHighlights: 0,
			};
			mockFetchResponse(mockLink);

			const link = await client.addLink({ url: "https://example.com" });

			expect(link.id).toBe("link-123");
			expect(link.url).toBe("https://example.com");
		});

		test("sends correct request body", async () => {
			const mockLink = {
				id: "link-123",
				url: "https://example.com",
				title: "My Title",
				highlights: [],
				nHighlights: 0,
			};
			mockFetchResponse(mockLink);

			await client.addLink({ url: "https://example.com", title: "My Title" });

			expect(fetchSpy).toHaveBeenCalledWith(
				"https://curius.app/api/links",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({
						url: "https://example.com",
						title: "My Title",
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

		test("returns null when not found", async () => {
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

			expect(info.users).toHaveLength(1);
			expect(info.users[0]?.firstName).toBe("Alice");
			expect(info.highlights).toHaveLength(1);
		});

		test("returns empty users/highlights when no network info", async () => {
			const mockResponse = {
				networkInfo: {
					id: 456,
					link: "https://example.com",
					users: [],
					highlights: [],
				},
			};
			mockFetchResponse(mockResponse);

			const info = await client.getNetworkInfo("https://example.com");

			expect(info.users).toHaveLength(0);
			expect(info.highlights).toHaveLength(0);
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
		test("adds highlight with position data", async () => {
			const mockHighlight = {
				id: "h-123",
				highlight: "Selected text",
			};
			mockFetchResponse(mockHighlight);

			const position = {
				rawHighlight: "Selected text",
				leftContext: "before ",
				rightContext: " after",
			};

			const highlight = await client.addHighlight("link-123", position);

			expect(highlight.id).toBe("h-123");
			expect(fetchSpy).toHaveBeenCalledWith(
				"https://curius.app/api/links/link-123/highlights",
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining("Selected text"),
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
				await client.addLink({ url: "invalid" });
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

		test("returns false for invalid token", async () => {
			mockFetchError(401);

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
