import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { env } from "@/lib/env";

export const authClient = createAuthClient({
	baseURL: env.VITE_SERVER_URL,
	plugins: [passkeyClient(), magicLinkClient(), adminClient()],
});
