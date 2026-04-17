/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKeys from "../apiKeys.js";
import type * as auth from "../auth.js";
import type * as bookmarks from "../bookmarks.js";
import type * as cliAuth from "../cliAuth.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as feed from "../feed.js";
import type * as friendships from "../friendships.js";
import type * as highlights from "../highlights.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_cascade from "../lib/cascade.js";
import type * as lib_friends from "../lib/friends.js";
import type * as lib_url from "../lib/url.js";
import type * as lib_visibility from "../lib/visibility.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as testing from "../testing.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKeys: typeof apiKeys;
  auth: typeof auth;
  bookmarks: typeof bookmarks;
  cliAuth: typeof cliAuth;
  comments: typeof comments;
  crons: typeof crons;
  feed: typeof feed;
  friendships: typeof friendships;
  highlights: typeof highlights;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/cascade": typeof lib_cascade;
  "lib/friends": typeof lib_friends;
  "lib/url": typeof lib_url;
  "lib/visibility": typeof lib_visibility;
  search: typeof search;
  seed: typeof seed;
  testing: typeof testing;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
};
