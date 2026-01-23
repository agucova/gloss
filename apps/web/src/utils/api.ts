import { treaty } from "@elysiajs/eden";
import { env } from "@gloss/env/web";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { App } from "server";
import { toast } from "sonner";

/**
 * TanStack Query client with global error handling.
 */
export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error, query) => {
			toast.error(error.message, {
				action: {
					label: "retry",
					onClick: () => query.invalidate(),
				},
			});
		},
	}),
});

/**
 * Eden Treaty client for type-safe API calls.
 *
 * Usage:
 * ```ts
 * // GET request
 * const { data, error } = await api.api.highlights.get({ query: { url: "..." } })
 *
 * // POST request
 * const { data, error } = await api.api.highlights.post({ ... })
 *
 * // Dynamic route
 * const { data, error } = await api.api.highlights({ id: "abc" }).delete()
 * ```
 */
export const api = treaty<App>(env.VITE_SERVER_URL, {
	fetch: {
		credentials: "include",
	},
});
