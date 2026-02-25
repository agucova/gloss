import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { bookmarkTag } from "./tags";

export const bookmark = pgTable(
	"bookmark",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		urlHash: text("url_hash").notNull(),
		title: text("title"),
		description: text("description"),
		// Metadata for rich link previews
		favicon: text("favicon"),
		ogImage: text("og_image"),
		ogDescription: text("og_description"),
		siteName: text("site_name"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("bookmark_userId_idx").on(table.userId),
		index("bookmark_urlHash_idx").on(table.urlHash),
		index("bookmark_createdAt_idx").on(table.createdAt),
		// User can only bookmark a URL once
		unique("bookmark_user_url").on(table.userId, table.urlHash),
	]
);

export const bookmarkRelations = relations(bookmark, ({ one, many }) => ({
	user: one(user, {
		fields: [bookmark.userId],
		references: [user.id],
	}),
	bookmarkTags: many(bookmarkTag),
}));
