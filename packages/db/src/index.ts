import { env } from "@gloss/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export const db = drizzle(env.DATABASE_URL, { schema });

// Re-export commonly used drizzle-orm utilities
export { and, asc, desc, eq, not, or } from "drizzle-orm";
