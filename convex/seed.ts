import type { Id } from "./_generated/dataModel";

/**
 * Seed script for Convex development database.
 * Run via Convex dashboard or: npx convex run seed:run
 */
import { internalMutation } from "./_generated/server";
import { normalizeUrl, hashUrl } from "./lib/url";

// ─── Seed data ──────────────────────────────────────

const USERS = [
	{
		name: "Agustín Covarrubias",
		email: "gloss@agucova.dev",
		username: "agucova",
		role: "admin",
	},
	{ name: "Alice Chen", email: "alice@example.com", username: "alicechen" },
	{ name: "Bob Martinez", email: "bob@example.com", username: "bobm" },
	{ name: "Carol Davis", email: "carol@example.com", username: "carol" },
	{ name: "Dan Wilson", email: "dan@example.com", username: "danw" },
	{ name: "Eve Johnson", email: "eve@example.com", username: "evej" },
] as const;

const URLS = {
	paulgraham: "https://www.paulgraham.com/read.html",
	alignment: "https://www.cold-takes.com/most-important-century/",
	reasoning: "https://gwern.net/scaling-hypothesis",
	zettelkasten: "https://zettelkasten.de/introduction/",
	deepwork:
		"https://calnewport.com/deep-work-rules-for-focused-success-in-a-distracted-world/",
	areflect: "https://andymatuschak.org/books/",
	tools: "https://numinous.productions/ttft/",
};

function createSelector(text: string) {
	return {
		range: {
			type: "RangeSelector" as const,
			startContainer: "",
			startOffset: 0,
			endContainer: "",
			endOffset: 0,
		},
		position: {
			type: "TextPositionSelector" as const,
			start: 0,
			end: text.length,
		},
		quote: {
			type: "TextQuoteSelector" as const,
			exact: text,
			prefix: "",
			suffix: "",
		},
	};
}

export const run = internalMutation({
	args: {},
	handler: async (ctx) => {
		console.log("=== Gloss Convex Seed ===");

		// Create users
		const userIds: Record<string, Id<"users">> = {};
		for (const u of USERS) {
			const id = await ctx.db.insert("users", {
				name: u.name,
				email: u.email,
				emailVerified: true,
				username: u.username,
				role: "role" in u ? u.role : "user",
				profileVisibility: "public",
				highlightsVisibility: "friends",
				bookmarksVisibility: "public",
				highlightDisplayFilter: "friends",
				commentDisplayMode: "collapsed",
			});
			userIds[u.username] = id;
		}
		console.log(`Created ${USERS.length} users`);

		// Create friendships
		const friendships = [
			{ r: "agucova", a: "alicechen", status: "accepted" as const },
			{ r: "bobm", a: "agucova", status: "accepted" as const },
			{ r: "agucova", a: "carol", status: "accepted" as const },
			{ r: "evej", a: "agucova", status: "accepted" as const },
			{ r: "danw", a: "agucova", status: "pending" as const },
			{ r: "alicechen", a: "bobm", status: "accepted" as const },
			{ r: "carol", a: "alicechen", status: "accepted" as const },
			{ r: "evej", a: "bobm", status: "accepted" as const },
			{ r: "carol", a: "evej", status: "accepted" as const },
		];
		for (const f of friendships) {
			await ctx.db.insert("friendships", {
				requesterId: userIds[f.r]!,
				addresseeId: userIds[f.a]!,
				status: f.status,
			});
		}
		console.log(`Created ${friendships.length} friendships`);

		// Create highlights
		const highlights = [
			{
				user: "agucova",
				url: URLS.paulgraham,
				text: "Reading about x doesn't just teach you about x; it also teaches you how to write.",
				visibility: "friends" as const,
			},
			{
				user: "agucova",
				url: URLS.paulgraham,
				text: "You can't think well without writing well, and you can't write well without reading well.",
				visibility: "public" as const,
			},
			{
				user: "agucova",
				url: URLS.areflect,
				text: "Books are surprisingly bad at conveying knowledge, and readers mostly don't realize it.",
				visibility: "public" as const,
			},
			{
				user: "agucova",
				url: URLS.tools,
				text: "Memory is, in fact, a central part of cognition. But the right response to this is not immense amounts of dreary rote memorization.",
				visibility: "public" as const,
			},
			{
				user: "agucova",
				url: URLS.alignment,
				text: "the 21st century could be the most important century ever for humanity, via the development of advanced AI systems",
				visibility: "public" as const,
			},
			{
				user: "agucova",
				url: URLS.zettelkasten,
				text: "A Zettelkasten makes connecting and not collecting a priority.",
				visibility: "public" as const,
			},
			{
				user: "agucova",
				url: URLS.deepwork,
				text: "Deep work is like a superpower in our current economy.",
				visibility: "friends" as const,
			},
			{
				user: "agucova",
				url: URLS.reasoning,
				text: "the blessings of scale as the secret of AGI: intelligence is 'just' simple neural units & learning algorithms applied to diverse experiences at a (currently) unreachable scale.",
				visibility: "public" as const,
			},
			{
				user: "alicechen",
				url: URLS.paulgraham,
				text: "Writing is not just a way to convey ideas, but also a way to have them.",
				visibility: "friends" as const,
			},
			{
				user: "alicechen",
				url: URLS.areflect,
				text: "Prose can frame or stimulate readers' thoughts, but prose can't behave or respond to those thoughts as they unfold.",
				visibility: "friends" as const,
			},
			{
				user: "alicechen",
				url: URLS.tools,
				text: "the most powerful tools for thought express deep insights into the underlying subject matter",
				visibility: "public" as const,
			},
			{
				user: "bobm",
				url: URLS.reasoning,
				text: "hard problems are easier to solve than easy problems---everything gets better as it gets larger",
				visibility: "friends" as const,
			},
			{
				user: "bobm",
				url: URLS.alignment,
				text: "if PASTA systems are misaligned - pursuing their own non-human-compatible objectives - things could very quickly go sideways",
				visibility: "friends" as const,
			},
			{
				user: "bobm",
				url: URLS.deepwork,
				text: "The Deep Work Hypothesis. Deep work is becoming increasingly valuable at the same time that it's becoming increasingly rare.",
				visibility: "public" as const,
			},
			{
				user: "carol",
				url: URLS.zettelkasten,
				text: "The fixed address of each note is the alpha and omega of the world of Zettelkasten.",
				visibility: "friends" as const,
			},
			{
				user: "carol",
				url: URLS.areflect,
				text: "It is possible to design new mediums which embody specific ideas about how people think and learn.",
				visibility: "friends" as const,
			},
			{
				user: "evej",
				url: URLS.deepwork,
				text: "Deep work is also an activity that generates a sense of meaning and fulfillment in your professional life.",
				visibility: "friends" as const,
			},
			{
				user: "evej",
				url: URLS.tools,
				text: "You need the insight-through-making loop to operate",
				visibility: "friends" as const,
			},
			{
				user: "danw",
				url: URLS.reasoning,
				text: "neural nets absorb data & compute, generalizing and becoming more Bayesian as problems get harder",
				visibility: "public" as const,
			},
		];

		const highlightIds: Id<"highlights">[] = [];
		for (const h of highlights) {
			const normalized = normalizeUrl(h.url);
			const urlHash = await hashUrl(normalized);
			const domain = new URL(normalized).hostname.replace(/^www\./, "");
			const id = await ctx.db.insert("highlights", {
				userId: userIds[h.user]!,
				url: normalized,
				urlHash,
				selector: createSelector(h.text),
				text: h.text,
				visibility: h.visibility,
				searchContent: `${h.text} ${domain}`,
			});
			highlightIds.push(id);
		}
		console.log(`Created ${highlights.length} highlights`);

		// Create bookmarks
		const bookmarks = [
			{
				user: "agucova",
				url: URLS.paulgraham,
				title: "The Need to Read",
				description: "Paul Graham on why reading is essential",
			},
			{
				user: "agucova",
				url: URLS.areflect,
				title: "Why Books Don't Work",
				description: "Andy Matuschak on limitations of books",
			},
			{
				user: "agucova",
				url: URLS.tools,
				title: "Transformative Tools for Thought",
				description: "Matuschak & Nielsen on designing new mediums",
			},
			{
				user: "agucova",
				url: URLS.alignment,
				title: "The Most Important Century",
				description: "Holden Karnofsky's series on AI",
			},
			{
				user: "agucova",
				url: URLS.reasoning,
				title: "The Scaling Hypothesis",
				description: "Gwern on neural network scaling",
			},
			{
				user: "agucova",
				url: URLS.zettelkasten,
				title: "Zettelkasten Introduction",
				description: "The linking note-taking system",
			},
			{
				user: "agucova",
				url: URLS.deepwork,
				title: "Deep Work",
				description: "Cal Newport on focused work",
			},
			{
				user: "alicechen",
				url: URLS.paulgraham,
				title: "The Need to Read",
				description: "Paul Graham on reading",
			},
			{
				user: "alicechen",
				url: URLS.zettelkasten,
				title: "Zettelkasten Introduction",
				description: "Note-taking methodology",
			},
			{
				user: "bobm",
				url: URLS.reasoning,
				title: "The Scaling Hypothesis",
				description: "On scaling laws",
			},
			{
				user: "bobm",
				url: URLS.deepwork,
				title: "Deep Work",
				description: "Focus and productivity",
			},
			{
				user: "carol",
				url: URLS.zettelkasten,
				title: "Zettelkasten Method",
				description: "How to build a second brain",
			},
			{
				user: "evej",
				url: URLS.deepwork,
				title: "Deep Work",
				description: "The value of focused work",
			},
		];

		const bookmarkIds: Record<string, Id<"bookmarks">> = {};
		for (const b of bookmarks) {
			const normalized = normalizeUrl(b.url);
			const urlHash = await hashUrl(normalized);
			const domain = new URL(normalized).hostname.replace(/^www\./, "");
			const id = await ctx.db.insert("bookmarks", {
				userId: userIds[b.user]!,
				url: normalized,
				urlHash,
				title: b.title,
				description: b.description,
				searchContent: `${b.title} ${b.description} ${domain}`,
			});
			bookmarkIds[`${b.user}_${b.url}`] = id;
		}
		console.log(`Created ${bookmarks.length} bookmarks`);

		// Create tags
		const tagDefs = [
			{ user: "agucova", name: "reading", color: "#FFE4B5" },
			{ user: "agucova", name: "ai-safety", color: "#E6E6FA" },
			{ user: "agucova", name: "pkm", color: "#98FB98" },
			{ user: "agucova", name: "productivity", color: "#ADD8E6" },
			{ user: "alicechen", name: "note-taking", color: "#FFB6C1" },
			{ user: "alicechen", name: "learning", color: "#FFFACD" },
			{ user: "bobm", name: "machine-learning", color: "#E6E6FA" },
			{ user: "bobm", name: "focus", color: "#FFE4B5" },
		];

		const tagIds: Record<string, Id<"tags">> = {};
		for (const t of tagDefs) {
			const id = await ctx.db.insert("tags", {
				userId: userIds[t.user]!,
				name: t.name,
				color: t.color,
				isSystem: false,
			});
			tagIds[`${t.user}_${t.name}`] = id;
		}
		console.log(`Created ${tagDefs.length} tags`);

		// Create bookmark-tag associations
		const bTagAssocs = [
			{
				bUser: "agucova",
				bUrl: URLS.paulgraham,
				tUser: "agucova",
				tName: "reading",
			},
			{
				bUser: "agucova",
				bUrl: URLS.areflect,
				tUser: "agucova",
				tName: "reading",
			},
			{ bUser: "agucova", bUrl: URLS.areflect, tUser: "agucova", tName: "pkm" },
			{ bUser: "agucova", bUrl: URLS.tools, tUser: "agucova", tName: "pkm" },
			{
				bUser: "agucova",
				bUrl: URLS.alignment,
				tUser: "agucova",
				tName: "ai-safety",
			},
			{
				bUser: "agucova",
				bUrl: URLS.reasoning,
				tUser: "agucova",
				tName: "ai-safety",
			},
			{
				bUser: "agucova",
				bUrl: URLS.zettelkasten,
				tUser: "agucova",
				tName: "pkm",
			},
			{
				bUser: "agucova",
				bUrl: URLS.deepwork,
				tUser: "agucova",
				tName: "productivity",
			},
			{
				bUser: "alicechen",
				bUrl: URLS.paulgraham,
				tUser: "alicechen",
				tName: "learning",
			},
			{
				bUser: "alicechen",
				bUrl: URLS.zettelkasten,
				tUser: "alicechen",
				tName: "note-taking",
			},
			{
				bUser: "bobm",
				bUrl: URLS.reasoning,
				tUser: "bobm",
				tName: "machine-learning",
			},
			{ bUser: "bobm", bUrl: URLS.deepwork, tUser: "bobm", tName: "focus" },
		];

		for (const a of bTagAssocs) {
			const bId = bookmarkIds[`${a.bUser}_${a.bUrl}`];
			const tId = tagIds[`${a.tUser}_${a.tName}`];
			if (bId && tId) {
				await ctx.db.insert("bookmarkTags", { bookmarkId: bId, tagId: tId });
			}
		}
		console.log(`Created ${bTagAssocs.length} bookmark-tag associations`);

		// Create comments
		const commentData = [
			{
				highlight: 2,
				author: "alicechen",
				content:
					"This is exactly why I've been experimenting with spaced repetition embedded in articles.",
			},
			{
				highlight: 4,
				author: "bobm",
				content:
					"Holden's framing here is interesting but I think he undersells the coordination challenges.",
			},
			{
				highlight: 5,
				author: "carol",
				content:
					"This principle transformed how I take notes. Before I was just hoarding quotes.",
			},
			{
				highlight: 6,
				author: "evej",
				content:
					"Deep work has been huge for my research output. The hard part is protecting the time.",
			},
			{
				highlight: 8,
				author: "agucova",
				content: "This connects nicely to the Feynman technique.",
			},
		];

		for (const c of commentData) {
			const hId = highlightIds[c.highlight];
			if (hId) {
				await ctx.db.insert("comments", {
					highlightId: hId,
					authorId: userIds[c.author]!,
					content: c.content,
					searchContent: c.content,
				});
			}
		}
		console.log(`Created ${commentData.length} comments`);

		console.log("\n=== Seed Complete ===");
		console.log("Test users: agucova, alicechen, bobm, carol, danw, evej");
		console.log("Agucova has 4 accepted friends: Alice, Bob, Carol, Eve");
		console.log("Dan has a pending friend request to Agucova");
	},
});
