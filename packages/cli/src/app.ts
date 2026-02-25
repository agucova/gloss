import { buildApplication, buildRouteMap } from "@stricli/core";

import { authRoutes } from "./commands/auth/index.js";
import { bookmarksListCommand } from "./commands/bookmarks.js";
import { highlightsListCommand } from "./commands/highlights.js";
import { searchCommand } from "./commands/search.js";
import { tagsListCommand } from "./commands/tags.js";

const routes = buildRouteMap({
	routes: {
		auth: authRoutes,
		search: searchCommand,
		highlights: highlightsListCommand,
		bookmarks: bookmarksListCommand,
		tags: tagsListCommand,
	},
	docs: {
		brief: "Gloss CLI - Access your highlights, bookmarks, and comments",
	},
});

export const app = buildApplication(routes, {
	name: "gloss",
	versionInfo: {
		currentVersion: "0.0.1",
	},
});
