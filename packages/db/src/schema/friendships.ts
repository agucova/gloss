import { relations } from "drizzle-orm";
import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const friendshipStatusEnum = pgEnum("friendship_status", [
	"pending",
	"accepted",
	"rejected",
]);

export const friendship = pgTable(
	"friendship",
	{
		id: text("id").primaryKey(),
		requesterId: text("requester_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		addresseeId: text("addressee_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		status: friendshipStatusEnum("status").default("pending").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("friendship_requesterId_idx").on(table.requesterId),
		index("friendship_addresseeId_idx").on(table.addresseeId),
		index("friendship_status_idx").on(table.status),
		// Ensure no duplicate friendship requests between two users
		unique("friendship_unique_pair").on(table.requesterId, table.addresseeId),
	]
);

export const friendshipRelations = relations(friendship, ({ one }) => ({
	requester: one(user, {
		fields: [friendship.requesterId],
		references: [user.id],
		relationName: "friendshipRequester",
	}),
	addressee: one(user, {
		fields: [friendship.addresseeId],
		references: [user.id],
		relationName: "friendshipAddressee",
	}),
}));
