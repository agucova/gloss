import { pgEnum } from "drizzle-orm/pg-core";

export const visibilityEnum = pgEnum("visibility", [
	"private",
	"friends",
	"public",
]);

export const highlightDisplayFilterEnum = pgEnum("highlight_display_filter", [
	"anyone",
	"friends",
	"me",
]);

export const commentDisplayModeEnum = pgEnum("comment_display_mode", [
	"expanded",
	"collapsed",
]);
