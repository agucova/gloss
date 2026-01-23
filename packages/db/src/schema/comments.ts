import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { highlight } from "./highlights";

/**
 * Comments on highlights (marginalia).
 * Flat structure — no threading to keep UI simple.
 */
export const comment = pgTable(
	"comment",
	{
		id: text("id").primaryKey(),
		highlightId: text("highlight_id")
			.notNull()
			.references(() => highlight.id, { onDelete: "cascade" }),
		authorId: text("author_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Markdown content stored as plain text
		content: text("content").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		// Soft delete support
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		index("comment_highlightId_idx").on(table.highlightId),
		index("comment_authorId_idx").on(table.authorId),
		index("comment_createdAt_idx").on(table.createdAt),
	]
);

/**
 * Tracks @mentions in comments for notifications/filtering.
 */
export const commentMention = pgTable(
	"comment_mention",
	{
		id: text("id").primaryKey(),
		commentId: text("comment_id")
			.notNull()
			.references(() => comment.id, { onDelete: "cascade" }),
		mentionedUserId: text("mentioned_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("commentMention_commentId_idx").on(table.commentId),
		index("commentMention_mentionedUserId_idx").on(table.mentionedUserId),
	]
);

// Relations
export const commentRelations = relations(comment, ({ one, many }) => ({
	highlight: one(highlight, {
		fields: [comment.highlightId],
		references: [highlight.id],
	}),
	author: one(user, {
		fields: [comment.authorId],
		references: [user.id],
	}),
	mentions: many(commentMention),
}));

export const commentMentionRelations = relations(commentMention, ({ one }) => ({
	comment: one(comment, {
		fields: [commentMention.commentId],
		references: [comment.id],
	}),
	mentionedUser: one(user, {
		fields: [commentMention.mentionedUserId],
		references: [user.id],
	}),
}));
