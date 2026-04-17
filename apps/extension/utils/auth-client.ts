import {
	convexClient,
	crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Better-Auth client shared across extension surfaces (background service
 * worker, newtab page, popup). Works with React or vanilla — the newtab wraps
 * a `ConvexBetterAuthProvider` around it to drive Convex's React hooks.
 *
 * The extension runs at a `chrome-extension://…` origin. Better-Auth is served
 * from `VITE_CONVEX_SITE_URL`, so:
 * - `crossDomainClient` handles the cross-origin session handshake via header-
 *   carried tokens (the server's `crossDomain` plugin in `convex/auth.ts`).
 * - `convexClient` provisions the Convex JWT for authenticated queries.
 *
 * For this to work end-to-end, the extension's origin must be listed in the
 * Convex deployment's `EXTENSION_ORIGINS` env var (see `convex/auth.ts` and
 * `convex/http.ts`).
 */
const baseURL = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
if (!baseURL) {
	throw new Error(
		"VITE_CONVEX_SITE_URL is not configured. Ensure the monorepo root .env is loaded (see wxt.config.ts envDir)."
	);
}

export const authClient = createAuthClient({
	baseURL,
	fetchOptions: {
		credentials: "include",
	},
	plugins: [convexClient(), crossDomainClient()],
});
