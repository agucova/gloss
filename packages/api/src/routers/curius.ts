import {
	addHighlightInputSchema,
	addLinkInputSchema,
	CuriusAuthError,
	CuriusClient,
	CuriusError,
	connectCuriusInputSchema,
	deleteHighlightInputSchema,
	getLinkByUrlInputSchema,
	getNetworkHighlightsInputSchema,
} from "@gloss/curius";
import { db, eq } from "@gloss/db";
import { curiusCredentials } from "@gloss/db/schema";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { protectedProcedure, router } from "../index";

/**
 * Get or create a Curius client for the current user.
 * Throws PRECONDITION_FAILED if no Curius credentials are stored.
 */
async function getCuriusClient(userId: string): Promise<CuriusClient> {
	const credentials = await db.query.curiusCredentials.findFirst({
		where: eq(curiusCredentials.userId, userId),
	});

	if (!credentials) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Curius account not connected",
		});
	}

	return new CuriusClient({ token: credentials.token });
}

export const curiusRouter = router({
	/**
	 * Check if Curius is connected for the current user
	 */
	getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
		const credentials = await db.query.curiusCredentials.findFirst({
			where: eq(curiusCredentials.userId, ctx.session.user.id),
		});

		if (!credentials) {
			return { connected: false };
		}

		return {
			connected: true,
			curiusUserId: credentials.curiusUserId,
			curiusUsername: credentials.curiusUsername,
			lastVerifiedAt: credentials.lastVerifiedAt,
		};
	}),

	/**
	 * Connect a Curius account by storing the JWT token
	 */
	connect: protectedProcedure
		.input(connectCuriusInputSchema)
		.mutation(async ({ ctx, input }) => {
			const client = new CuriusClient({ token: input.token });

			// Verify the token and get user info
			let curiusUser: Awaited<ReturnType<typeof client.getUser>>;
			try {
				curiusUser = await client.getUser();
			} catch (error) {
				if (error instanceof CuriusAuthError) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "Invalid Curius token",
					});
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof CuriusError
							? error.message
							: "Failed to verify Curius token",
				});
			}

			// Upsert the credentials
			const existing = await db.query.curiusCredentials.findFirst({
				where: eq(curiusCredentials.userId, ctx.session.user.id),
			});

			if (existing) {
				await db
					.update(curiusCredentials)
					.set({
						token: input.token,
						curiusUserId: curiusUser.id,
						curiusUsername: curiusUser.userLink,
						lastVerifiedAt: new Date(),
					})
					.where(eq(curiusCredentials.userId, ctx.session.user.id));
			} else {
				await db.insert(curiusCredentials).values({
					id: nanoid(),
					userId: ctx.session.user.id,
					token: input.token,
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
		}),

	/**
	 * Disconnect Curius account
	 */
	disconnect: protectedProcedure.mutation(async ({ ctx }) => {
		await db
			.delete(curiusCredentials)
			.where(eq(curiusCredentials.userId, ctx.session.user.id));

		return { success: true };
	}),

	/**
	 * Get the Curius user profile
	 */
	getUser: protectedProcedure.query(async ({ ctx }) => {
		const client = await getCuriusClient(ctx.session.user.id);
		try {
			return await client.getUser();
		} catch (error) {
			if (error instanceof CuriusAuthError) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Curius token expired or invalid",
				});
			}
			throw error;
		}
	}),

	/**
	 * Get the list of users the Curius user follows
	 */
	getFollowing: protectedProcedure.query(async ({ ctx }) => {
		const client = await getCuriusClient(ctx.session.user.id);
		return client.getFollowing();
	}),

	/**
	 * Check if a URL is already saved in Curius
	 */
	getLinkByUrl: protectedProcedure
		.input(getLinkByUrlInputSchema)
		.query(async ({ ctx, input }) => {
			const client = await getCuriusClient(ctx.session.user.id);
			return client.getLinkByUrl(input.url);
		}),

	/**
	 * Get friend/network highlights for a URL
	 */
	getNetworkHighlights: protectedProcedure
		.input(getNetworkHighlightsInputSchema)
		.query(async ({ ctx, input }) => {
			const client = await getCuriusClient(ctx.session.user.id);
			return client.getNetworkLinks(input.url);
		}),

	/**
	 * Add a link to Curius
	 */
	addLink: protectedProcedure
		.input(addLinkInputSchema)
		.mutation(async ({ ctx, input }) => {
			const client = await getCuriusClient(ctx.session.user.id);
			return client.addLink(input);
		}),

	/**
	 * Add a highlight to an existing Curius link
	 */
	addHighlight: protectedProcedure
		.input(addHighlightInputSchema)
		.mutation(async ({ ctx, input }) => {
			const client = await getCuriusClient(ctx.session.user.id);
			return client.addHighlight(input.linkId, input.position);
		}),

	/**
	 * Delete a highlight from a Curius link
	 */
	deleteHighlight: protectedProcedure
		.input(deleteHighlightInputSchema)
		.mutation(async ({ ctx, input }) => {
			const client = await getCuriusClient(ctx.session.user.id);
			await client.deleteHighlight(input.linkId, input.highlightText);
			return { success: true };
		}),
});

export type CuriusRouter = typeof curiusRouter;
