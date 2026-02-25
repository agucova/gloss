import { db } from "@gloss/db";
import { apiKey } from "@gloss/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";

import {
	type TestUser,
	authenticatedRequest,
	cleanupTestUser,
	createTestUser,
	unauthenticatedRequest,
} from "./setup";
import { createTestApp } from "./test-app";

const app = createTestApp();

let userA: TestUser;
let userB: TestUser;

beforeAll(async () => {
	userA = await createTestUser({ name: "API Key User A" });
	userB = await createTestUser({ name: "API Key User B" });
});

afterAll(async () => {
	await cleanupTestUser(userA.id);
	await cleanupTestUser(userB.id);
});

// ============================================================================
// Auth enforcement
// ============================================================================

describe("API key auth enforcement", () => {
	it("POST /api/keys returns 401 when unauthenticated", async () => {
		const res = await unauthenticatedRequest(app, "POST", "/api/keys", {
			body: { name: "test key" },
		});
		expect(res.status).toBe(401);
	});

	it("GET /api/keys returns 401 when unauthenticated", async () => {
		const res = await unauthenticatedRequest(app, "GET", "/api/keys");
		expect(res.status).toBe(401);
	});

	it("PATCH /api/keys/:id returns 401 when unauthenticated", async () => {
		const res = await unauthenticatedRequest(
			app,
			"PATCH",
			"/api/keys/fake-id",
			{ body: { name: "updated" } }
		);
		expect(res.status).toBe(401);
	});

	it("DELETE /api/keys/:id returns 401 when unauthenticated", async () => {
		const res = await unauthenticatedRequest(
			app,
			"DELETE",
			"/api/keys/fake-id"
		);
		expect(res.status).toBe(401);
	});
});

// ============================================================================
// Create + list
// ============================================================================

describe("POST /api/keys", () => {
	it("creates a key with gloss_sk_ prefix and returns plaintext", async () => {
		const res = await authenticatedRequest(app, "POST", "/api/keys", userA, {
			body: { name: "My Test Key" },
		});

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.key).toBeDefined();
		expect(data.key).toStartWith("gloss_sk_");
		expect(data.name).toBe("My Test Key");
		expect(data.scope).toBe("read");
		expect(data.id).toBeDefined();
	});

	it("does not expose plaintext key in GET list", async () => {
		// Create a key
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/keys",
			userA,
			{ body: { name: "List Test Key" } }
		);
		expect(createRes.status).toBe(201);
		const created = await createRes.json();

		// List keys
		const listRes = await authenticatedRequest(app, "GET", "/api/keys", userA);
		expect(listRes.status).toBe(200);
		const listData = await listRes.json();

		const found = listData.keys.find((k: any) => k.id === created.id);
		expect(found).toBeDefined();
		expect(found.keyPrefix).toBeDefined();
		expect(found.keyPrefix).toStartWith("gloss_sk_");
		// Plaintext key should NOT be in the list response
		expect(found.key).toBeUndefined();
		expect(found.keyHash).toBeUndefined();
	});

	it("creates a key with write scope", async () => {
		const res = await authenticatedRequest(app, "POST", "/api/keys", userA, {
			body: { name: "Write Key", scope: "write" },
		});

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.scope).toBe("write");
	});
});

// ============================================================================
// Authorization (cross-user)
// ============================================================================

describe("API key authorization", () => {
	let keyId: string;

	beforeAll(async () => {
		const res = await authenticatedRequest(app, "POST", "/api/keys", userA, {
			body: { name: "Auth Test Key" },
		});
		const data = await res.json();
		keyId = data.id;
	});

	it("PATCH returns 403 when updating another user's key", async () => {
		const res = await authenticatedRequest(
			app,
			"PATCH",
			`/api/keys/${keyId}`,
			userB,
			{ body: { name: "Hacked" } }
		);
		expect(res.status).toBe(403);
	});

	it("DELETE returns 403 when revoking another user's key", async () => {
		const res = await authenticatedRequest(
			app,
			"DELETE",
			`/api/keys/${keyId}`,
			userB
		);
		expect(res.status).toBe(403);
	});
});

// ============================================================================
// Revocation
// ============================================================================

describe("API key revocation", () => {
	it("DELETE soft-revokes a key, removing it from GET list", async () => {
		// Create
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/keys",
			userA,
			{ body: { name: "Revoke Test Key" } }
		);
		const created = await createRes.json();

		// Revoke
		const deleteRes = await authenticatedRequest(
			app,
			"DELETE",
			`/api/keys/${created.id}`,
			userA
		);
		expect(deleteRes.status).toBe(200);
		const deleteData = await deleteRes.json();
		expect(deleteData.success).toBe(true);

		// Verify not in list
		const listRes = await authenticatedRequest(app, "GET", "/api/keys", userA);
		const listData = await listRes.json();
		const found = listData.keys.find((k: any) => k.id === created.id);
		expect(found).toBeUndefined();

		// Verify still in DB (soft delete)
		const dbRow = await db.query.apiKey.findFirst({
			where: eq(apiKey.id, created.id),
		});
		expect(dbRow).toBeDefined();
		expect(dbRow!.revoked).toBe(true);
	});
});

// ============================================================================
// validateApiKey
// ============================================================================

describe("validateApiKey", () => {
	// Import dynamically to get the version with mocked auth in place
	let validateApiKey: typeof import("@gloss/api/routes/api-keys").validateApiKey;

	beforeAll(async () => {
		const mod = await import("@gloss/api/routes/api-keys");
		validateApiKey = mod.validateApiKey;
	});

	it("returns user for a valid key", async () => {
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/keys",
			userA,
			{ body: { name: "Validate Test Key" } }
		);
		const created = await createRes.json();

		const result = await validateApiKey(created.key);
		expect(result).not.toBeNull();
		expect(result!.user.id).toBe(userA.id);
		expect(result!.scope).toBe("read");
	});

	it("returns null for a revoked key", async () => {
		// Create and revoke
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/keys",
			userA,
			{ body: { name: "Revoked Validate Key" } }
		);
		const created = await createRes.json();
		await authenticatedRequest(app, "DELETE", `/api/keys/${created.id}`, userA);

		const result = await validateApiKey(created.key);
		expect(result).toBeNull();
	});

	it("returns null for an expired key", async () => {
		// Create with past expiration
		const pastDate = new Date(Date.now() - 86400000).toISOString();
		const createRes = await authenticatedRequest(
			app,
			"POST",
			"/api/keys",
			userA,
			{ body: { name: "Expired Key", expiresAt: pastDate } }
		);
		const created = await createRes.json();

		const result = await validateApiKey(created.key);
		expect(result).toBeNull();
	});

	it("returns null for wrong prefix", async () => {
		const result = await validateApiKey("wrong_prefix_key123");
		expect(result).toBeNull();
	});

	it("returns null for non-existent key with correct prefix", async () => {
		const result = await validateApiKey(
			"gloss_sk_nonexistentkey12345678901234567"
		);
		expect(result).toBeNull();
	});
});
