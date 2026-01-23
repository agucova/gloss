import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const apiKeyScopeEnum = pgEnum("api_key_scope", ["read", "write"]);

export const apiKey = pgTable(
	"api_key",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		keyHash: text("key_hash").notNull().unique(),
		keyPrefix: text("key_prefix").notNull(),
		scope: apiKeyScopeEnum("scope").default("read").notNull(),
		lastUsedAt: timestamp("last_used_at"),
		expiresAt: timestamp("expires_at"),
		revoked: boolean("revoked").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("api_key_userId_idx").on(table.userId),
		index("api_key_keyHash_idx").on(table.keyHash),
	]
);

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
	user: one(user, {
		fields: [apiKey.userId],
		references: [user.id],
	}),
}));
