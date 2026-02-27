/**
 * Constants for seed user data.
 * These match the users created by `npx convex run seed:run`.
 *
 * Note: Convex generates its own IDs (_id), so we identify seed users
 * by email rather than deterministic IDs. The `id` field here is kept
 * for backward compatibility but should not be used for DB lookups.
 */

export const SEED_USERS = {
	agucova: {
		name: "Agustín Covarrubias",
		username: "agucova",
		email: "gloss@agucova.dev",
	},
	alice: {
		name: "Alice Chen",
		username: "alicechen",
		email: "alice@example.com",
	},
	bob: {
		name: "Bob Martinez",
		username: "bobm",
		email: "bob@example.com",
	},
	carol: {
		name: "Carol Davis",
		username: "carol",
		email: "carol@example.com",
	},
	dan: {
		name: "Dan Wilson",
		username: "danw",
		email: "dan@example.com",
	},
	eve: {
		name: "Eve Johnson",
		username: "evej",
		email: "eve@example.com",
	},
} as const;

// Accepted friendships (bidirectional):
// agucova <-> alice, bob, carol, eve
// alice <-> bob, carol
// bob <-> eve
// carol <-> eve
// Pending: dan -> agucova
