import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

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
