import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import { Authenticated } from "convex/react";
import { lazy, Suspense } from "react";

import Header from "@/components/header";
import { PasskeyPrompt } from "@/components/passkey-prompt";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "../index.css";

const TanStackRouterDevtools = import.meta.env.PROD
	? () => null
	: lazy(() =>
			import("@tanstack/react-router-devtools").then((m) => ({
				default: m.TanStackRouterDevtools,
			}))
		);

export const Route = createRootRouteWithContext()({
	component: RootComponent,
	head: () => ({
		meta: [
			{
				title: "gloss",
			},
			{
				name: "description",
				content: "Highlight text on any webpage and share with friends",
			},
		],
	}),
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<ThemeProvider
				attribute="class"
				defaultTheme="dark"
				disableTransitionOnChange
				storageKey="vite-ui-theme"
			>
				<div className="grid h-svh grid-rows-[auto_1fr]">
					<Authenticated>
						<Header />
					</Authenticated>
					<Outlet />
				</div>
				<Toaster richColors />
				<PasskeyPrompt />
			</ThemeProvider>
			<Suspense fallback={null}>
				<TanStackRouterDevtools position="bottom-left" />
			</Suspense>
		</>
	);
}
