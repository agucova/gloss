import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().url(),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.string().url(),
		CORS_ORIGIN: z.string().url(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		PORT: z.coerce.number().default(3000),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
