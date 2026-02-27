import { passkeyClient } from "@better-auth/passkey/client";
import {
	convexClient,
	crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_CONVEX_SITE_URL as string,
	plugins: [
		passkeyClient(),
		magicLinkClient(),
		convexClient(),
		crossDomainClient(),
	],
});
