import { cors } from "@elysiajs/cors";
import { api } from "@gloss/api";
import { auth } from "@gloss/auth";
import { env } from "@gloss/env/server";
import { Elysia } from "elysia";
import { curiusRoutes } from "./routes/curius";

export const app = new Elysia()
	.use(
		cors({
			origin: env.CORS_ORIGIN,
			methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		})
	)
	.all("/api/auth/*", async (context) => {
		const { request, set } = context;
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
