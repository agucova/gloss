import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { bookmark } from "./bookmarks";

/**
 * Tags for organizing bookmarks.
 * Tags are scoped to a user (not global) for privacy.
 * System tags (favorites, to-read) are auto-created and cannot be modified.
 */
export const tag = pgTable(
	"tag",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Lowercase, trimmed tag name (e.g., "reading-list", "work")
		name: text("name").notNull(),
		// Optional color for visual distinction
		color: text("color"),
		// System tags (favorites, to-read) are auto-created and protected
		isSystem: boolean("is_system").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("tag_userId_idx").on(table.userId),
		index("tag_isSystem_idx").on(table.isSystem),
		// User can't have duplicate tag names
		unique("tag_user_name").on(table.userId, table.name),
	]
);

/**
 * Junction table linking bookmarks to tags (many-to-many).
 */
export const bookmarkTag = pgTable(
	"bookmark_tag",
	{
		id: text("id").primaryKey(),
		bookmarkId: text("bookmark_id")
			.notNull()
			.references(() => bookmark.id, { onDelete: "cascade" }),
		tagId: text("tag_id")
			.notNull()
			.references(() => tag.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("bookmarkTag_bookmarkId_idx").on(table.bookmarkId),
		index("bookmarkTag_tagId_idx").on(table.tagId),
		// Prevent duplicate bookmark-tag associations
		unique("bookmarkTag_bookmark_tag").on(table.bookmarkId, table.tagId),
	]
);

// Relations
export const tagRelations = relations(tag, ({ one, many }) => ({
	user: one(user, {
		fields: [tag.userId],
		references: [user.id],
	}),
	bookmarks: many(bookmarkTag),
}));

export const bookmarkTagRelations = relations(bookmarkTag, ({ one }) => ({
	bookmark: one(bookmark, {
		fields: [bookmarkTag.bookmarkId],
		references: [bookmark.id],
	}),
	tag: one(tag, {
		fields: [bookmarkTag.tagId],
		references: [tag.id],
	}),
}));
