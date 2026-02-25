import { buildRouteMap } from "@stricli/core";

import { loginCommand } from "./login.js";
import { logoutCommand } from "./logout.js";
import { setKeyCommand } from "./set-key.js";
import { whoamiCommand } from "./whoami.js";

export const authRoutes = buildRouteMap({
	routes: {
		login: loginCommand,
		logout: logoutCommand,
		"set-key": setKeyCommand,
		whoami: whoamiCommand,
	},
	docs: {
		brief: "Authentication commands",
	},
});
