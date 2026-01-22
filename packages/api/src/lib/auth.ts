import { auth } from "@gloss/auth";
import { Elysia } from "elysia";

/**
 * Auth plugin that derives the session from request headers.
 * Use this plugin to access `session` in route handlers.
 */
export const authPlugin = new Elysia({ name: "auth" }).derive(
	async ({ request }) => {
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return { session };
	}
);

/**
 * Protected plugin that requires authentication.
 * Use this plugin for routes that require a valid session.
 * The session is guaranteed to be non-null in guarded routes.
 */
export const protectedPlugin = new Elysia({ name: "protected" })
	.use(authPlugin)
	.guard({
		beforeHandle({ session, set }) {
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}
		},
	})
	.as("plugin");
