import { relations } from "drizzle-orm";
import {
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const visibilityEnum = pgEnum("visibility", [
	"private",
	"friends",
	"public",
]);

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
		note: text("note"),
		color: text("color").default("#FFFF00").notNull(),
		visibility: visibilityEnum("visibility").default("friends").notNull(),
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
	]
);

export const highlightRelations = relations(highlight, ({ one }) => ({
	user: one(user, {
		fields: [highlight.userId],
		references: [user.id],
	}),
}));
