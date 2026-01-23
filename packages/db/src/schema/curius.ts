import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Maps Curius users to Gloss users for deduplication.
 * When a friend has both Curius and Gloss accounts, we show their Gloss highlights
 * and skip their Curius highlights (since they've likely migrated).
 */
export const curiusUserMapping = pgTable(
	"curius_user_mapping",
	{
		id: text("id").primaryKey(),
		curiusUserId: text("curius_user_id").notNull().unique(),
		curiusUsername: text("curius_username").notNull(),
		// If this Curius user has a Gloss account, link it here
		glossUserId: text("gloss_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		// Cached profile info for display when they don't have a Gloss account
		firstName: text("first_name").notNull(),
		lastName: text("last_name").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("curius_user_mapping_curiusUserId_idx").on(table.curiusUserId),
		index("curius_user_mapping_glossUserId_idx").on(table.glossUserId),
	]
);

export const curiusUserMappingRelations = relations(
	curiusUserMapping,
	({ one }) => ({
		glossUser: one(user, {
			fields: [curiusUserMapping.glossUserId],
			references: [user.id],
		}),
	})
);

export const curiusCredentials = pgTable(
	"curius_credentials",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.unique()
			.references(() => user.id, { onDelete: "cascade" }),
		token: text("token").notNull(),
		curiusUserId: text("curius_user_id"),
		curiusUsername: text("curius_username"),
		lastVerifiedAt: timestamp("last_verified_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("curius_credentials_userId_idx").on(table.userId)]
);

export const curiusCredentialsRelations = relations(
	curiusCredentials,
	({ one }) => ({
		user: one(user, {
			fields: [curiusCredentials.userId],
			references: [user.id],
		}),
	})
);
