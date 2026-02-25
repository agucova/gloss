import { createFileRoute, redirect } from "@tanstack/react-router";

import { ReadLaterPage } from "@/components/read-later/read-later-page";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/read-later")({
	component: ReadLaterPage,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({ to: "/login" });
		}
		return { session: session.data };
	},
});
