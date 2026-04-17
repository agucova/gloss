import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.test).*s");

async function seedUser(
	t: ReturnType<typeof convexTest>,
	overrides: { authId: string; name?: string; email?: string }
) {
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			authId: overrides.authId,
			name: overrides.name ?? "Test User",
			email: overrides.email ?? `${overrides.authId}@example.com`,
			emailVerified: true,
		})
	);
}

describe("curius credentials", () => {
	it("setCredentials inserts a row and self-maps the user", async () => {
		const t = convexTest(schema, modules);
		const authId = "auth_user_1";
		const userId = await seedUser(t, { authId });
		const asUser = t.withIdentity({ subject: authId });

		await asUser.mutation(api.curius.setCredentials, {
			token: "jwt-1",
			curiusUserId: "6361",
			curiusUsername: "agus",
			firstName: "Agustín",
			lastName: "Covarrubias",
		});

		const creds = await t.run(async (ctx) =>
			ctx.db.query("curiusCredentials").collect()
		);
		expect(creds).toHaveLength(1);
		expect(creds[0]?.userId).toBe(userId);
		expect(creds[0]?.token).toBe("jwt-1");
		expect(creds[0]?.curiusUserId).toBe("6361");

		const mappings = await t.run(async (ctx) =>
			ctx.db.query("curiusUserMappings").collect()
		);
		expect(mappings).toHaveLength(1);
		expect(mappings[0]?.glossUserId).toBe(userId);
		expect(mappings[0]?.curiusUserId).toBe("6361");
	});

	it("setCredentials overwrites on re-run without duplicating rows", async () => {
		const t = convexTest(schema, modules);
		const authId = "auth_user_1";
		await seedUser(t, { authId });
		const asUser = t.withIdentity({ subject: authId });

		await asUser.mutation(api.curius.setCredentials, {
			token: "jwt-1",
			curiusUserId: "6361",
			curiusUsername: "agus",
			firstName: "A",
			lastName: "C",
		});
		await asUser.mutation(api.curius.setCredentials, {
			token: "jwt-2-rotated",
			curiusUserId: "6361",
			curiusUsername: "agus",
			firstName: "A",
			lastName: "C",
		});

		const creds = await t.run(async (ctx) =>
			ctx.db.query("curiusCredentials").collect()
		);
		expect(creds).toHaveLength(1);
		expect(creds[0]?.token).toBe("jwt-2-rotated");
	});

	it("disconnect removes the credentials row but keeps the mapping", async () => {
		const t = convexTest(schema, modules);
		const authId = "auth_user_1";
		await seedUser(t, { authId });
		const asUser = t.withIdentity({ subject: authId });

		await asUser.mutation(api.curius.setCredentials, {
			token: "jwt-1",
			curiusUserId: "6361",
			curiusUsername: "agus",
			firstName: "A",
			lastName: "C",
		});
		await asUser.mutation(api.curius.disconnect, {});

		const creds = await t.run(async (ctx) =>
			ctx.db.query("curiusCredentials").collect()
		);
		expect(creds).toHaveLength(0);

		// Mapping stays — other users may still see this account via bridge
		const mappings = await t.run(async (ctx) =>
			ctx.db.query("curiusUserMappings").collect()
		);
		expect(mappings).toHaveLength(1);
	});

	it("getConnectionStatus returns connected=false when no row exists", async () => {
		const t = convexTest(schema, modules);
		const authId = "auth_user_1";
		await seedUser(t, { authId });
		const asUser = t.withIdentity({ subject: authId });

		const status = await asUser.query(api.curius.getConnectionStatus, {});
		expect(status.connected).toBe(false);
	});

	it("getConnectionStatus returns connected details after setCredentials", async () => {
		const t = convexTest(schema, modules);
		const authId = "auth_user_1";
		await seedUser(t, { authId });
		const asUser = t.withIdentity({ subject: authId });

		await asUser.mutation(api.curius.setCredentials, {
			token: "jwt-1",
			curiusUserId: "6361",
			curiusUsername: "agus",
			firstName: "A",
			lastName: "C",
		});

		const status = await asUser.query(api.curius.getConnectionStatus, {});
		expect(status.connected).toBe(true);
		if (status.connected) {
			expect(status.curiusUsername).toBe("agus");
			expect(status.lastVerifiedAt).toBeTypeOf("number");
		}
	});

	it("getConnectionStatus surfaces stalled status when running >15min", async () => {
		const t = convexTest(schema, modules);
		const authId = "auth_user_1";
		const userId = await seedUser(t, { authId });
		const asUser = t.withIdentity({ subject: authId });

		const sixteenMinAgo = Date.now() - 16 * 60 * 1000;
		await t.run(async (ctx) => {
			await ctx.db.insert("curiusCredentials", {
				userId,
				token: "jwt-1",
				curiusUserId: "6361",
				curiusUsername: "agus",
				lastImportStatus: "running",
				lastImportStartedAt: sixteenMinAgo,
			});
		});

		const status = await asUser.query(api.curius.getConnectionStatus, {});
		expect(status.connected).toBe(true);
		if (status.connected) {
			expect(status.lastImportStatus).toBe("stalled");
		}
	});

	it("getConnectionStatus leaves running status alone when fresh", async () => {
		const t = convexTest(schema, modules);
		const authId = "auth_user_1";
		const userId = await seedUser(t, { authId });
		const asUser = t.withIdentity({ subject: authId });

		const twoMinAgo = Date.now() - 2 * 60 * 1000;
		await t.run(async (ctx) => {
			await ctx.db.insert("curiusCredentials", {
				userId,
				token: "jwt-1",
				lastImportStatus: "running",
				lastImportStartedAt: twoMinAgo,
			});
		});

		const status = await asUser.query(api.curius.getConnectionStatus, {});
		if (status.connected) {
			expect(status.lastImportStatus).toBe("running");
		}
	});

	it("getCredentialsForExtension returns null when not connected", async () => {
		const t = convexTest(schema, modules);
		const authId = "auth_user_1";
		await seedUser(t, { authId });
		const asUser = t.withIdentity({ subject: authId });

		const result = await asUser.query(
			api.curius.getCredentialsForExtension,
			{}
		);
		expect(result).toBeNull();
	});

	it("getCredentialsForExtension returns token + curiusUserId", async () => {
		const t = convexTest(schema, modules);
		const authId = "auth_user_1";
		await seedUser(t, { authId });
		const asUser = t.withIdentity({ subject: authId });

		await asUser.mutation(api.curius.setCredentials, {
			token: "jwt-1",
			curiusUserId: "6361",
			curiusUsername: "agus",
			firstName: "A",
			lastName: "C",
		});

		const result = await asUser.query(
			api.curius.getCredentialsForExtension,
			{}
		);
		expect(result).not.toBeNull();
		expect(result?.token).toBe("jwt-1");
		expect(result?.curiusUserId).toBe("6361");
	});

	it("requireAuth guards all entrypoints", async () => {
		const t = convexTest(schema, modules);

		await expect(t.query(api.curius.getConnectionStatus, {})).rejects.toThrow(
			/Authentication required/
		);

		await expect(
			t.query(api.curius.getCredentialsForExtension, {})
		).rejects.toThrow(/Authentication required/);

		await expect(t.mutation(api.curius.disconnect, {})).rejects.toThrow(
			/Authentication required/
		);

		await expect(
			t.mutation(api.curius.setCredentials, {
				token: "x",
				curiusUserId: "x",
				curiusUsername: "x",
				firstName: "x",
				lastName: "x",
			})
		).rejects.toThrow(/Authentication required/);
	});
});

describe("curius import", () => {
	async function setupConnectedUser() {
		const t = convexTest(schema, modules);
		const authId = "auth_user_1";
		const userId = await seedUser(t, { authId });
		const asUser = t.withIdentity({ subject: authId });

		await asUser.mutation(api.curius.setCredentials, {
			token: "jwt-1",
			curiusUserId: "6361",
			curiusUsername: "agus",
			firstName: "Agus",
			lastName: "Covarrubias",
		});

		return { t, userId, asUser };
	}

	it("startImport → finishImport flips status and stamps timestamps", async () => {
		const { t, asUser } = await setupConnectedUser();

		await asUser.mutation(api.curius.startImport, {});
		let status = await asUser.query(api.curius.getConnectionStatus, {});
		if (status.connected) {
			expect(status.lastImportStatus).toBe("running");
			expect(status.lastImportStartedAt).toBeTypeOf("number");
			expect(status.lastImportFinishedAt).toBeUndefined();
		}

		await asUser.mutation(api.curius.finishImport, {});
		status = await asUser.query(api.curius.getConnectionStatus, {});
		if (status.connected) {
			expect(status.lastImportStatus).toBe("completed");
			expect(status.lastImportFinishedAt).toBeTypeOf("number");
		}

		// Exactly one credentials row throughout
		const creds = await t.run(async (ctx) =>
			ctx.db.query("curiusCredentials").collect()
		);
		expect(creds).toHaveLength(1);
	});

	it("failImport records the error message", async () => {
		const { asUser } = await setupConnectedUser();

		await asUser.mutation(api.curius.startImport, {});
		await asUser.mutation(api.curius.failImport, { error: "token_expired" });

		const status = await asUser.query(api.curius.getConnectionStatus, {});
		if (status.connected) {
			expect(status.lastImportStatus).toBe("failed");
			expect(status.lastImportError).toBe("token_expired");
		}
	});

	it("startImport sweeps stalled 'running' status from a prior aborted run", async () => {
		const { t, userId, asUser } = await setupConnectedUser();

		const twentyMinAgo = Date.now() - 20 * 60 * 1000;
		await t.run(async (ctx) => {
			const row = await ctx.db
				.query("curiusCredentials")
				.withIndex("by_userId", (q) => q.eq("userId", userId))
				.first();
			if (row) {
				await ctx.db.patch(row._id, {
					lastImportStatus: "running",
					lastImportStartedAt: twentyMinAgo,
				});
			}
		});

		// Sanity: before startImport, the query surfaces it as stalled.
		const before = await asUser.query(api.curius.getConnectionStatus, {});
		if (before.connected) {
			expect(before.lastImportStatus).toBe("stalled");
		}

		// startImport overwrites.
		await asUser.mutation(api.curius.startImport, {});
		const after = await asUser.query(api.curius.getConnectionStatus, {});
		if (after.connected) {
			expect(after.lastImportStatus).toBe("running");
			// And the timestamp got replaced, not kept.
			expect(after.lastImportStartedAt).toBeGreaterThan(twentyMinAgo);
		}
	});

	it("updateImportProgress records cumulative counters", async () => {
		const { asUser } = await setupConnectedUser();
		await asUser.mutation(api.curius.startImport, {});

		await asUser.mutation(api.curius.updateImportProgress, {
			linksProcessed: 50,
			highlightsImported: 120,
		});
		let status = await asUser.query(api.curius.getConnectionStatus, {});
		if (status.connected) {
			expect(status.linksProcessed).toBe(50);
			expect(status.highlightsImported).toBe(120);
		}

		await asUser.mutation(api.curius.updateImportProgress, {
			linksProcessed: 100,
			highlightsImported: 250,
		});
		status = await asUser.query(api.curius.getConnectionStatus, {});
		if (status.connected) {
			expect(status.linksProcessed).toBe(100);
			expect(status.highlightsImported).toBe(250);
		}
	});

	it("startImport throws when not connected", async () => {
		const t = convexTest(schema, modules);
		const authId = "auth_user_1";
		await seedUser(t, { authId });
		const asUser = t.withIdentity({ subject: authId });

		await expect(asUser.mutation(api.curius.startImport, {})).rejects.toThrow(
			/Not connected to Curius/
		);
	});

	it("importChunk inserts bookmarks + highlights on first pass", async () => {
		const { t, userId, asUser } = await setupConnectedUser();

		const result = await asUser.mutation(api.curius.importChunk, {
			links: [
				{
					url: "https://paulgraham.com/greatwork.html",
					title: "How to Do Great Work",
					highlights: [
						{
							externalId: "curius-hl-1",
							rawHighlight: "The first step is to decide what to work on.",
							leftContext: "",
							rightContext: "",
						},
						{
							externalId: "curius-hl-2",
							rawHighlight: "Work on projects of your own.",
							leftContext: "",
							rightContext: "",
						},
					],
				},
			],
		});
		expect(result.bookmarksInserted).toBe(1);
		expect(result.highlightsInserted).toBe(2);

		const bookmarks = await t.run(async (ctx) =>
			ctx.db
				.query("bookmarks")
				.withIndex("by_userId", (q) => q.eq("userId", userId))
				.collect()
		);
		expect(bookmarks).toHaveLength(1);
		expect(bookmarks[0]?.title).toBe("How to Do Great Work");

		const highlights = await t.run(async (ctx) =>
			ctx.db
				.query("highlights")
				.withIndex("by_userId", (q) => q.eq("userId", userId))
				.collect()
		);
		expect(highlights).toHaveLength(2);
		for (const h of highlights) {
			expect(h.importSource).toBe("curius");
			expect(h.visibility).toBe("friends");
			expect(h.selector).toBeTypeOf("object");
			// Quote-only selector shape
			expect((h.selector as { quote: { type: string } }).quote.type).toBe(
				"TextQuoteSelector"
			);
		}
	});

	it("importChunk is idempotent on re-run (dedup by externalId)", async () => {
		const { t, userId, asUser } = await setupConnectedUser();

		const payload = {
			links: [
				{
					url: "https://paulgraham.com/greatwork.html",
					title: "How to Do Great Work",
					highlights: [
						{
							externalId: "curius-hl-1",
							rawHighlight: "The first step is to decide what to work on.",
							leftContext: "",
							rightContext: "",
						},
					],
				},
			],
		};

		const first = await asUser.mutation(api.curius.importChunk, payload);
		expect(first.highlightsInserted).toBe(1);

		const second = await asUser.mutation(api.curius.importChunk, payload);
		expect(second.highlightsInserted).toBe(0);
		expect(second.bookmarksInserted).toBe(0);

		const highlights = await t.run(async (ctx) =>
			ctx.db
				.query("highlights")
				.withIndex("by_userId", (q) => q.eq("userId", userId))
				.collect()
		);
		expect(highlights).toHaveLength(1);
	});

	it("importChunk skips bookmark upsert when one already exists", async () => {
		const { t, userId, asUser } = await setupConnectedUser();

		// Pre-existing native bookmark — native edits must win.
		await t.run(async (ctx) => {
			const { hashUrl, normalizeUrl } = await import("./lib/url");
			const url = normalizeUrl("https://paulgraham.com/greatwork.html");
			await ctx.db.insert("bookmarks", {
				userId,
				url,
				urlHash: await hashUrl(url),
				title: "Native title the user set",
			});
		});

		await asUser.mutation(api.curius.importChunk, {
			links: [
				{
					url: "https://paulgraham.com/greatwork.html",
					title: "Curius-provided title",
					highlights: [],
				},
			],
		});

		const bookmarks = await t.run(async (ctx) =>
			ctx.db
				.query("bookmarks")
				.withIndex("by_userId", (q) => q.eq("userId", userId))
				.collect()
		);
		expect(bookmarks).toHaveLength(1);
		expect(bookmarks[0]?.title).toBe("Native title the user set");
	});

	it("upsertMappings dedupes within a chunk and preserves glossUserId", async () => {
		const { t, asUser } = await setupConnectedUser();

		// Fresh second user to hold a glossUserId we'll defend.
		const otherAuthId = "auth_user_other";
		const otherUserId = await seedUser(t, { authId: otherAuthId });
		await t.run(async (ctx) => {
			await ctx.db.insert("curiusUserMappings", {
				curiusUserId: "9999",
				curiusUsername: "existing",
				firstName: "Existing",
				lastName: "User",
				glossUserId: otherUserId,
			});
		});

		// Send a chunk with a duplicate mapping (same curiusUserId twice) and
		// one that tries to clobber the existing glossUserId.
		await asUser.mutation(api.curius.upsertMappings, {
			mappings: [
				{
					curiusUserId: "1234",
					curiusUsername: "alice",
					firstName: "Alice",
					lastName: "A",
				},
				{
					curiusUserId: "1234",
					curiusUsername: "alice",
					firstName: "Alice",
					lastName: "A",
				},
				{
					curiusUserId: "9999",
					curiusUsername: "existing-renamed",
					firstName: "Existing",
					lastName: "UserRenamed",
				},
			],
		});

		const mappings = await t.run(async (ctx) =>
			ctx.db.query("curiusUserMappings").collect()
		);

		// 1 from setCredentials (self: 6361), 1 for alice (1234, deduped), 1 for existing (9999)
		expect(mappings).toHaveLength(3);

		const existing = mappings.find((m) => m.curiusUserId === "9999");
		expect(existing?.glossUserId).toBe(otherUserId); // preserved
		expect(existing?.curiusUsername).toBe("existing-renamed"); // display refreshed
	});

	it("all import mutations require auth", async () => {
		const t = convexTest(schema, modules);

		await expect(t.mutation(api.curius.startImport, {})).rejects.toThrow(
			/Authentication required/
		);
		await expect(
			t.mutation(api.curius.updateImportProgress, {
				linksProcessed: 1,
				highlightsImported: 1,
			})
		).rejects.toThrow(/Authentication required/);
		await expect(t.mutation(api.curius.finishImport, {})).rejects.toThrow(
			/Authentication required/
		);
		await expect(
			t.mutation(api.curius.failImport, { error: "x" })
		).rejects.toThrow(/Authentication required/);
		await expect(
			t.mutation(api.curius.importChunk, { links: [] })
		).rejects.toThrow(/Authentication required/);
		await expect(
			t.mutation(api.curius.upsertMappings, { mappings: [] })
		).rejects.toThrow(/Authentication required/);
	});
});
