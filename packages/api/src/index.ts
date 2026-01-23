import { Elysia } from "elysia";
import { apiKeys } from "./routes/api-keys";
import { bookmarks } from "./routes/bookmarks";
import { cliAuth } from "./routes/cli-auth";
import { comments } from "./routes/comments";
import { feed } from "./routes/feed";
import { friendships } from "./routes/friendships";
import { highlights } from "./routes/highlights";
import { search } from "./routes/search";
import { users } from "./routes/users";

// Export CLI auth for server to mount before Better-Auth handler
export { cliAuth };

/**
 * Main API router that composes all route plugins.
 * Mount this on the server under /api prefix.
 */
export const api = new Elysia({ prefix: "/api" })
	.use(apiKeys)
	.use(highlights)
	.use(comments)
	.use(friendships)
	.use(bookmarks)
	.use(feed)
	.use(search)
	.use(users);

/**
 * Export the API type for Eden Treaty clients.
 */
export type Api = typeof api;
