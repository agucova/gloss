import { createFileRoute, redirect } from "@tanstack/react-router";

import { BookshelfPage } from "@/components/bookshelf";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/library")({
	component: BookshelfPage,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({
				to: "/login",
			});
		}
		return { session: session.data };
	},
});
