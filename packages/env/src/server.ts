import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { z } from "zod";

// Load .env from monorepo root in development
// In production (Docker), env vars are passed at runtime
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../.env");
if (existsSync(envPath)) {
	config({ path: envPath });
}

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().url(),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.string().url(),
		VITE_WEB_URL: z.string().url(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		PORT: z.coerce.number().default(3000),

		// Google OAuth
		GOOGLE_CLIENT_ID: z.string().optional(),
		GOOGLE_CLIENT_SECRET: z.string().optional(),

		// Apple OAuth
		APPLE_CLIENT_ID: z.string().optional(),
		APPLE_CLIENT_SECRET: z.string().optional(),

		// Resend (for magic links)
		RESEND_API_KEY: z.string().optional(),
		// Accepts RFC 5322 format: "Display Name <email@example.com>" or plain email
		EMAIL_FROM: z.string().optional(),

		// OpenAI API (for semantic search embeddings)
		OPENAI_API_KEY: z.string().optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
