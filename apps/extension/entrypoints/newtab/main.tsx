/** @jsxImportSource react */
import { ConvexProvider, ConvexReactClient } from "convex/react";
import React from "react";
import ReactDOM from "react-dom/client";

import { sendMessage } from "../../utils/messages";
import App from "./app";
import "./style.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// The newtab borrows its Convex JWT from the background service worker via the
// message bridge. The background is the auth holder (it calls Better-Auth's
// `/api/auth/convex/token` and caches the JWT); this callback is invoked by
// Convex whenever the client needs a fresh token. Returning `null` flips the
// client into the unauthenticated state.
convex.setAuth(async () => {
	try {
		const response = await sendMessage({ type: "GET_CONVEX_JWT" });
		return response.token ?? null;
	} catch {
		return null;
	}
});

const rootElement = document.getElementById("root");
if (rootElement) {
	ReactDOM.createRoot(rootElement).render(
		<React.StrictMode>
			<ConvexProvider client={convex}>
				<App />
			</ConvexProvider>
		</React.StrictMode>
	);
}
