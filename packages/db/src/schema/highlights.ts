import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { comment } from "./comments";
import { visibilityEnum } from "./enums";

export const highlight = pgTable(
	"highlight",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		urlHash: text("url_hash").notNull(),
		// Selector is flexible JSONB — exact schema depends on anchoring approach
		selector: jsonb("selector").notNull(),
		// Denormalized highlighted text for display/search
		text: text("text").notNull(),
		visibility: visibilityEnum("visibility").default("friends").notNull(),
		// Import tracking for Curius migration
		importSource: text("import_source"), // 'curius' | null (native)
		externalId: text("external_id"), // Original ID from source system
		importedAt: timestamp("imported_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("highlight_userId_idx").on(table.userId),
		index("highlight_urlHash_idx").on(table.urlHash),
		index("highlight_visibility_idx").on(table.visibility),
		index("highlight_createdAt_idx").on(table.createdAt),
		index("highlight_importSource_externalId_idx").on(
			table.importSource,
			table.externalId
		),
	]
);

export const highlightRelations = relations(highlight, ({ one, many }) => ({
	user: one(user, {
		fields: [highlight.userId],
		references: [user.id],
	}),
	comments: many(comment),
}));
