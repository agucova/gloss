import { env } from "@gloss/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import {
	account,
	accountRelations,
	bookmark,
	bookmarkRelations,
	curiusCredentials,
	curiusCredentialsRelations,
	friendship,
	friendshipRelations,
	friendshipStatusEnum,
	highlight,
	highlightRelations,
	session,
	sessionRelations,
	user,
	userRelations,
	verification,
	visibilityEnum,
} from "./schema";

const schema = {
	user,
	session,
	account,
	verification,
	userRelations,
	sessionRelations,
	accountRelations,
	bookmark,
	bookmarkRelations,
	highlight,
	highlightRelations,
	visibilityEnum,
	curiusCredentials,
	curiusCredentialsRelations,
	friendship,
	friendshipRelations,
	friendshipStatusEnum,
};

export const db = drizzle(env.DATABASE_URL, { schema });
