import { cors } from "@elysiajs/cors";
import { createContext } from "@gloss/api/context";
import { appRouter } from "@gloss/api/routers/index";
import { auth } from "@gloss/auth";
import { env } from "@gloss/env/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Elysia } from "elysia";
import { curiusRoutes } from "./routes/curius";

export const app = new Elysia()
	.use(
		cors({
			origin: env.CORS_ORIGIN,
			methods: ["GET", "POST", "DELETE", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		})
	)
	.all("/api/auth/*", async (context) => {
		const { request, status } = context;
		if (["POST", "GET"].includes(request.method)) {
			return auth.handler(request);
		}
		return status(405);
	})
	// Derive session for all routes under /api
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return { session };
	})
	// Mount Curius routes
	.use(curiusRoutes)
	// tRPC routes (kept for backward compatibility)
	.all("/trpc/*", async (context) => {
		const res = await fetchRequestHandler({
			endpoint: "/trpc",
			router: appRouter,
			req: context.request,
			createContext: () => createContext({ context }),
		});
		return res;
	})
	.get("/", () => "OK")
	.listen(env.PORT, () => {
		console.log(`Server is running on port ${env.PORT}`);
	});

// Export type for Eden Treaty
export type App = typeof app;
