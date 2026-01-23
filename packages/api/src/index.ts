import { Elysia } from "elysia";
import { bookmarks } from "./routes/bookmarks";
import { comments } from "./routes/comments";
import { feed } from "./routes/feed";
import { friendships } from "./routes/friendships";
import { highlights } from "./routes/highlights";
import { search } from "./routes/search";

/**
 * Main API router that composes all route plugins.
 * Mount this on the server under /api prefix.
 */
export const api = new Elysia({ prefix: "/api" })
	.use(highlights)
	.use(comments)
	.use(friendships)
	.use(bookmarks)
	.use(feed)
	.use(search);

/**
 * Export the API type for Eden Treaty clients.
 */
export type Api = typeof api;
