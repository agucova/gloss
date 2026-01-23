import type { QueryClient } from "@tanstack/react-query";

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import Header from "@/components/header";
import { PasskeyPrompt } from "@/components/passkey-prompt";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import type { api } from "@/utils/api";

import "../index.css";

export interface RouterAppContext {
	api: typeof api;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
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
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/icon.svg",
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
					<Header />
					<Outlet />
				</div>
				<Toaster richColors />
				<PasskeyPrompt />
			</ThemeProvider>
			<TanStackRouterDevtools position="bottom-left" />
			<ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
		</>
	);
}
