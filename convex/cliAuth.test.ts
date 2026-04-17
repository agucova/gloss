import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.test).*s");

function b64url(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkce() {
	const verifier = Array.from(crypto.getRandomValues(new Uint8Array(48)))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	const challenge = b64url(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
	);
	return { verifier, challenge };
}

async function setupUser(t: ReturnType<typeof convexTest>) {
	const userId = await t.run(async (ctx) => {
		return await ctx.db.insert("users", {
			name: "Test User",
			email: "test@example.com",
			emailVerified: true,
			profileVisibility: "public",
			highlightsVisibility: "friends",
			bookmarksVisibility: "public",
			highlightDisplayFilter: "friends",
			commentDisplayMode: "collapsed",
		});
	});
	const asUser = t.withIdentity({
		name: "Test User",
		email: "test@example.com",
	});
	return { userId, asUser };
}

describe("cliAuth", () => {
	it("completes the PKCE round-trip and mints an API key", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await setupUser(t);
		const { verifier, challenge } = await pkce();

		const { requestId } = await t.mutation(
			internal.cliAuth.createPendingRequest,
			{
				codeChallenge: challenge,
				redirectUri: "http://127.0.0.1:52313/callback",
				state: "teststate123",
			}
		);

		const pending = await t.query(api.cliAuth.getPendingRequest, {
			requestId,
		});
		expect(pending.status).toBe("pending");

		const { redirectUrl } = await asUser.mutation(api.cliAuth.approveRequest, {
			requestId,
		});
		const approvedUrl = new URL(redirectUrl);
		expect(approvedUrl.origin).toBe("http://127.0.0.1:52313");
		expect(approvedUrl.pathname).toBe("/callback");
		expect(approvedUrl.searchParams.get("state")).toBe("teststate123");
		const code = approvedUrl.searchParams.get("code");
		expect(code).toMatch(/^[0-9a-f]{64}$/);

		const exchange = await t.mutation(internal.cliAuth.exchangeForApiKey, {
			requestId,
			authCode: code!,
			codeVerifier: verifier,
		});
		expect(exchange.apiKey).toMatch(/^gloss_sk_[0-9a-f]{32}$/);
		expect(exchange.scope).toBe("read");

		const rows = await t.run(
			async (ctx) => await ctx.db.query("cliAuthPending").collect()
		);
		expect(rows).toHaveLength(0);

		const keys = await t.run(
			async (ctx) => await ctx.db.query("apiKeys").collect()
		);
		expect(keys).toHaveLength(1);
		expect(keys[0]?.scope).toBe("read");
		expect(keys[0]?.revoked).toBe(false);
	});

	it("rejects a wrong code_verifier", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await setupUser(t);
		const { challenge } = await pkce();

		const { requestId } = await t.mutation(
			internal.cliAuth.createPendingRequest,
			{
				codeChallenge: challenge,
				redirectUri: "http://127.0.0.1:40000/callback",
				state: "teststate123",
			}
		);
		const { redirectUrl } = await asUser.mutation(api.cliAuth.approveRequest, {
			requestId,
		});
		const code = new URL(redirectUrl).searchParams.get("code")!;

		await expect(
			t.mutation(internal.cliAuth.exchangeForApiKey, {
				requestId,
				authCode: code,
				codeVerifier: "completely-wrong-verifier",
			})
		).rejects.toThrow(/invalid_verifier/);

		const keys = await t.run(
			async (ctx) => await ctx.db.query("apiKeys").collect()
		);
		expect(keys).toHaveLength(0);
	});

	it("rejects a reused auth code (row deleted after first exchange)", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await setupUser(t);
		const { verifier, challenge } = await pkce();

		const { requestId } = await t.mutation(
			internal.cliAuth.createPendingRequest,
			{
				codeChallenge: challenge,
				redirectUri: "http://127.0.0.1:40001/callback",
				state: "teststate123",
			}
		);
		const { redirectUrl } = await asUser.mutation(api.cliAuth.approveRequest, {
			requestId,
		});
		const code = new URL(redirectUrl).searchParams.get("code")!;

		await t.mutation(internal.cliAuth.exchangeForApiKey, {
			requestId,
			authCode: code,
			codeVerifier: verifier,
		});

		await expect(
			t.mutation(internal.cliAuth.exchangeForApiKey, {
				requestId,
				authCode: code,
				codeVerifier: verifier,
			})
		).rejects.toThrow(/invalid_request/);
	});

	it("rejects an expired pending request", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await setupUser(t);
		const { verifier, challenge } = await pkce();

		const { requestId } = await t.mutation(
			internal.cliAuth.createPendingRequest,
			{
				codeChallenge: challenge,
				redirectUri: "http://127.0.0.1:40002/callback",
				state: "teststate123",
			}
		);
		const { redirectUrl } = await asUser.mutation(api.cliAuth.approveRequest, {
			requestId,
		});
		const code = new URL(redirectUrl).searchParams.get("code")!;

		await t.run(async (ctx) => {
			await ctx.db.patch(requestId, { expiresAt: Date.now() - 1000 });
		});

		await expect(
			t.mutation(internal.cliAuth.exchangeForApiKey, {
				requestId,
				authCode: code,
				codeVerifier: verifier,
			})
		).rejects.toThrow(/expired_request/);
	});

	it("rejects a non-loopback redirect_uri", async () => {
		const t = convexTest(schema, modules);
		await setupUser(t);
		const { challenge } = await pkce();

		await expect(
			t.mutation(internal.cliAuth.createPendingRequest, {
				codeChallenge: challenge,
				redirectUri: "https://evil.example.com/callback",
				state: "teststate123",
			})
		).rejects.toThrow(/Invalid redirect_uri/);
	});

	it("requires a session to approve", async () => {
		const t = convexTest(schema, modules);
		await setupUser(t);
		const { challenge } = await pkce();

		const { requestId } = await t.mutation(
			internal.cliAuth.createPendingRequest,
			{
				codeChallenge: challenge,
				redirectUri: "http://127.0.0.1:40003/callback",
				state: "teststate123",
			}
		);

		await expect(
			t.mutation(api.cliAuth.approveRequest, { requestId })
		).rejects.toThrow(/Authentication required/);
	});

	it("rejects exchanging before approval", async () => {
		const t = convexTest(schema, modules);
		await setupUser(t);
		const { verifier, challenge } = await pkce();

		const { requestId } = await t.mutation(
			internal.cliAuth.createPendingRequest,
			{
				codeChallenge: challenge,
				redirectUri: "http://127.0.0.1:40004/callback",
				state: "teststate123",
			}
		);

		await expect(
			t.mutation(internal.cliAuth.exchangeForApiKey, {
				requestId,
				authCode: "anything",
				codeVerifier: verifier,
			})
		).rejects.toThrow(/not_approved/);
	});

	it("deny flow builds an access_denied redirect and deletes the row", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await setupUser(t);
		const { challenge } = await pkce();

		const { requestId } = await t.mutation(
			internal.cliAuth.createPendingRequest,
			{
				codeChallenge: challenge,
				redirectUri: "http://127.0.0.1:40005/callback",
				state: "teststateXY",
			}
		);

		const { redirectUrl } = await asUser.mutation(api.cliAuth.denyRequest, {
			requestId,
		});
		const u = new URL(redirectUrl);
		expect(u.searchParams.get("error")).toBe("access_denied");
		expect(u.searchParams.get("state")).toBe("teststateXY");

		const rows = await t.run(
			async (ctx) => await ctx.db.query("cliAuthPending").collect()
		);
		expect(rows).toHaveLength(0);
	});

	it("rejects a malformed code_challenge", async () => {
		const t = convexTest(schema, modules);
		await setupUser(t);

		await expect(
			t.mutation(internal.cliAuth.createPendingRequest, {
				codeChallenge: "too-short",
				redirectUri: "http://127.0.0.1:40010/callback",
				state: "teststate123",
			})
		).rejects.toThrow(/code_challenge/);

		await expect(
			t.mutation(internal.cliAuth.createPendingRequest, {
				codeChallenge: "a".repeat(43).replace(/a$/, "!"),
				redirectUri: "http://127.0.0.1:40010/callback",
				state: "teststate123",
			})
		).rejects.toThrow(/code_challenge/);
	});

	it("rejects a too-short state", async () => {
		const t = convexTest(schema, modules);
		await setupUser(t);
		const { challenge } = await pkce();

		await expect(
			t.mutation(internal.cliAuth.createPendingRequest, {
				codeChallenge: challenge,
				redirectUri: "http://127.0.0.1:40011/callback",
				state: "short",
			})
		).rejects.toThrow(/state/);
	});

	it("rejects re-approval of an already-approved request", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await setupUser(t);
		const { challenge } = await pkce();

		const { requestId } = await t.mutation(
			internal.cliAuth.createPendingRequest,
			{
				codeChallenge: challenge,
				redirectUri: "http://127.0.0.1:40012/callback",
				state: "teststate123",
			}
		);
		await asUser.mutation(api.cliAuth.approveRequest, { requestId });

		await expect(
			asUser.mutation(api.cliAuth.approveRequest, { requestId })
		).rejects.toThrow(/already approved/);
	});
});
