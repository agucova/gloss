import { auth } from "@gloss/auth";
import { CuriusAuthError, CuriusClient, CuriusError } from "@gloss/curius";
import { db, eq } from "@gloss/db";
import { curiusCredentials } from "@gloss/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { Elysia, t } from "elysia";

/**
 * Get or create a Curius client for a user.
 * Returns null if no credentials are stored.
 */
async function getCuriusClient(userId: string): Promise<CuriusClient | null> {
	const credentials = await db.query.curiusCredentials.findFirst({
		where: eq(curiusCredentials.userId, userId),
	});

	if (!credentials) {
		return null;
	}

	return new CuriusClient({ token: credentials.token });
}

/**
 * Curius routes for Elysia
 * Uses Eden Treaty for type-safe client consumption
 */
export const curiusRoutes = new Elysia({ prefix: "/curius" })
	// Derive session for all curius routes
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return { session };
	})

	// Get connection status
	.get("/status", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const credentials = await db.query.curiusCredentials.findFirst({
			where: eq(curiusCredentials.userId, session.user.id),
		});

		if (!credentials) {
			return { connected: false as const };
		}

		return {
			connected: true as const,
			curiusUserId: credentials.curiusUserId,
			curiusUsername: credentials.curiusUsername,
			lastVerifiedAt: credentials.lastVerifiedAt?.toISOString() ?? null,
		};
	})

	// Connect Curius account
	.post(
		"/connect",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const client = new CuriusClient({ token: body.token });

			// Verify the token and get user info
			let curiusUser: Awaited<ReturnType<typeof client.getUser>>;
			try {
				curiusUser = await client.getUser();
			} catch (err) {
				if (err instanceof CuriusAuthError) {
					set.status = 401;
					return { error: "Invalid Curius token" };
				}
				set.status = 500;
				return {
					error:
						err instanceof CuriusError
							? err.message
							: "Failed to verify Curius token",
				};
			}

			// Upsert the credentials
			const existing = await db.query.curiusCredentials.findFirst({
				where: eq(curiusCredentials.userId, session.user.id),
			});

			if (existing) {
				await db
					.update(curiusCredentials)
					.set({
						token: body.token,
						curiusUserId: curiusUser.id,
						curiusUsername: curiusUser.userLink,
						lastVerifiedAt: new Date(),
					})
					.where(eq(curiusCredentials.userId, session.user.id));
			} else {
				await db.insert(curiusCredentials).values({
					id: createId(),
					userId: session.user.id,
					token: body.token,
					curiusUserId: curiusUser.id,
					curiusUsername: curiusUser.userLink,
					lastVerifiedAt: new Date(),
				});
			}

			return {
				success: true,
				curiusUserId: curiusUser.id,
				curiusUsername: curiusUser.userLink,
			};
		},
		{
			body: t.Object({
				token: t.String({ minLength: 1 }),
			}),
		}
	)

	// Disconnect Curius account
	.delete("/disconnect", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		await db
			.delete(curiusCredentials)
			.where(eq(curiusCredentials.userId, session.user.id));

		return { success: true };
	})

	// Get Curius user profile
	.get("/user", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const client = await getCuriusClient(session.user.id);
		if (!client) {
			set.status = 412;
			return { error: "Curius account not connected" };
		}

		try {
			return await client.getUser();
		} catch (err) {
			if (err instanceof CuriusAuthError) {
				set.status = 401;
				return { error: "Curius token expired or invalid" };
			}
			throw err;
		}
	})

	// Get following list
	.get("/following", async ({ session, set }) => {
		if (!session) {
			set.status = 401;
			return { error: "Authentication required" };
		}

		const client = await getCuriusClient(session.user.id);
		if (!client) {
			set.status = 412;
			return { error: "Curius account not connected" };
		}

		return await client.getFollowing();
	})

	// Get link by URL
	.post(
		"/links/by-url",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const client = await getCuriusClient(session.user.id);
			if (!client) {
				set.status = 412;
				return { error: "Curius account not connected" };
			}

			return await client.getLinkByUrl(body.url);
		},
		{
			body: t.Object({
				url: t.String({ format: "uri" }),
			}),
		}
	)

	// Get network highlights for a URL
	.post(
		"/links/network",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const client = await getCuriusClient(session.user.id);
			if (!client) {
				set.status = 412;
				return { error: "Curius account not connected" };
			}

			return await client.getNetworkLinks(body.url);
		},
		{
			body: t.Object({
				url: t.String({ format: "uri" }),
			}),
		}
	)

	// Add a link
	.post(
		"/links",
		async ({ body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const client = await getCuriusClient(session.user.id);
			if (!client) {
				set.status = 412;
				return { error: "Curius account not connected" };
			}

			return await client.addLink(body);
		},
		{
			body: t.Object({
				url: t.String({ format: "uri" }),
				title: t.Optional(t.String()),
			}),
		}
	)

	// Add a highlight to a link
	.post(
		"/links/:linkId/highlights",
		async ({ params, body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const client = await getCuriusClient(session.user.id);
			if (!client) {
				set.status = 412;
				return { error: "Curius account not connected" };
			}

			return await client.addHighlight(params.linkId, body.position);
		},
		{
			params: t.Object({
				linkId: t.String(),
			}),
			body: t.Object({
				position: t.Object({
					rawHighlight: t.String(),
					leftContext: t.String(),
					rightContext: t.String(),
				}),
				note: t.Optional(t.String()),
			}),
		}
	)

	// Delete a highlight from a link
	.delete(
		"/links/:linkId/highlights",
		async ({ params, body, session, set }) => {
			if (!session) {
				set.status = 401;
				return { error: "Authentication required" };
			}

			const client = await getCuriusClient(session.user.id);
			if (!client) {
				set.status = 412;
				return { error: "Curius account not connected" };
			}

			await client.deleteHighlight(params.linkId, body.highlightText);
			return { success: true };
		},
		{
			params: t.Object({
				linkId: t.String(),
			}),
			body: t.Object({
				highlightText: t.String(),
			}),
		}
	);
