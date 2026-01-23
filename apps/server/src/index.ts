import { cors } from "@elysiajs/cors";
import { api, cliAuth } from "@gloss/api";
import { auth } from "@gloss/auth";
import { env } from "@gloss/env/server";
import { Elysia } from "elysia";
import { curiusRoutes } from "./routes/curius";

/**
 * Check if an origin is allowed for CORS.
 */
function isAllowedOrigin(origin: string | null): boolean {
	if (!origin) {
		return false;
	}

	// Allow the configured web app origin
	if (origin === env.VITE_WEB_URL) {
		return true;
	}

	// Allow browser extension origins (Chrome/Firefox/Safari)
	if (
		origin.startsWith("chrome-extension://") ||
		origin.startsWith("moz-extension://") ||
		origin.startsWith("safari-web-extension://")
	) {
		return true;
	}

	// Development: allow localhost variants
	if (env.NODE_ENV === "development") {
		const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
		if (localhostPattern.test(origin)) {
			return true;
		}
	}

	return false;
}

export const app = new Elysia()
	.use(
		cors({
			origin: (request) => {
				const origin = request.headers.get("origin");
				return isAllowedOrigin(origin);
			},
			methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			allowedHeaders: [
				"Content-Type",
				"Authorization",
				"Accept",
				"Accept-Language",
				"X-Requested-With",
				"Cache-Control",
				"Pragma",
			],
			exposeHeaders: ["Content-Length", "X-Request-Id"],
			credentials: true,
			maxAge: 86_400, // Cache preflight for 24 hours
		})
	)
	// Mount CLI auth routes before Better-Auth handler
	.use(new Elysia({ prefix: "/api" }).use(cliAuth))
	.all("/api/auth/*", async (context) => {
		const { request, set } = context;
		// Skip CLI auth paths - they're handled by the cliAuth plugin above
		const url = new URL(request.url);
		if (url.pathname.startsWith("/api/auth/cli/")) {
			return;
		}
		if (["POST", "GET"].includes(request.method)) {
			return await auth.handler(request);
		}
		set.status = 405;
		return { error: "Method not allowed" };
	})
	// Mount Curius routes (legacy integration)
	.use(curiusRoutes)
	// Mount Gloss API routes
	.use(api)
	.get("/", () => "OK")
	.listen(env.PORT, () => {
		console.log(`Server is running on port ${env.PORT}`);
	});

// Export type for Eden Treaty
export type App = typeof app;
