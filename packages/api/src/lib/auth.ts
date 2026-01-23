import { auth } from "@gloss/auth";
import { Elysia } from "elysia";

/**
 * Auth plugin that derives the session from request headers.
 * Use this plugin to access `session` in route handlers.
 * Session may be null for unauthenticated requests.
 *
 * For protected routes, check `if (!session)` in handlers.
 * This follows the pattern used in curius routes.
 */
export const authPlugin = new Elysia({ name: "auth" }).derive(
	async ({ request }) => {
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return { session };
	}
);
