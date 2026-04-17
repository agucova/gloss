import type { libraryResponseSchema } from "@gloss/curius";
import type { z } from "zod";

/**
 * Feed item shape consumed by the dashboard. Kept structurally compatible
 * with native `FeedHighlight` / `FeedBookmark` types so the merge helper in
 * the dashboard package can union them freely; the `source` marker lets the
 * renderer distinguish for styling ("via Curius" tint).
 */
export interface BridgeFeedItem {
	_id: string;
	_creationTime: number;
	url: string;
	text?: string;
	title?: string;
	user: {
		_id: string;
		name: string;
		image?: string;
		username?: string;
	};
	source: "curius";
	externalId: string;
}

export type LibraryResponse = z.infer<typeof libraryResponseSchema>;

export type FeedMapping = {
	glossUserId: string | undefined;
	firstName: string;
	lastName: string;
	curiusUsername: string;
};

export type FeedKind = "highlights" | "bookmarks";

/**
 * Collect the set of Curius user IDs the shaper will need mappings for,
 * given a library response and a feed kind. Pulled out so the action can
 * batch a single Convex query for all authors before shaping.
 */
export function collectAuthorCuriusIds(
	library: LibraryResponse,
	kind: FeedKind
): string[] {
	const out = new Set<string>();
	for (const entry of library.library) {
		if (kind === "highlights") {
			for (const hl of entry.highlights) {
				if (hl.userId) out.add(hl.userId);
			}
		} else {
			for (const u of entry.users) {
				if (u.id) out.add(u.id);
			}
		}
	}
	return Array.from(out);
}

/**
 * Pure function that transforms a Curius `/api/library` response plus
 * pre-fetched author mappings into dashboard-ready feed items. No I/O.
 *
 * Behaviour contract:
 * - `kind: "highlights"` emits one feed item **per highlight** inside the
 *   library, with `_creationTime` from `hl.createdDate` when present
 *   (else falls back to the enclosing entry's `modifiedDate`, and finally
 *   to `Date.now()` for fully missing data — never NaN).
 * - `kind: "bookmarks"` emits one feed item **per entry**, attributed to
 *   `entry.users[0]`. Entries whose `users` array is empty are skipped.
 * - Display names prefer the mapping, then the inline user object, then
 *   the Curius userLink, finally a literal `"Someone"`.
 * - `user._id` is the mapped `glossUserId` when the friend has migrated;
 *   otherwise a synthetic `"curius:<id>"` so the dashboard can still
 *   attach an avatar color.
 * - Highlights with no usable quote text (no `rawHighlight` /
 *   `highlightText` / `highlight`) are dropped.
 * - Output is sorted descending by `_creationTime` and capped to `limit`.
 */
export function shapeFeedFromLibrary(
	library: LibraryResponse,
	kind: FeedKind,
	mappings: Record<string, FeedMapping>,
	limit: number,
	now: () => number = Date.now
): BridgeFeedItem[] {
	const items: BridgeFeedItem[] = [];

	for (const entry of library.library) {
		const parsedEntryTime = entry.modifiedDate
			? Date.parse(entry.modifiedDate)
			: NaN;
		const entryCreationTime = Number.isFinite(parsedEntryTime)
			? parsedEntryTime
			: now();

		if (kind === "highlights") {
			for (const hl of entry.highlights) {
				const authorId = hl.userId;
				if (!authorId) continue;
				const text = hl.rawHighlight ?? hl.highlightText ?? hl.highlight ?? "";
				if (!text) continue;

				const mapping = mappings[authorId];
				const authorInline = hl.user;
				const firstName = mapping?.firstName ?? authorInline?.firstName ?? "";
				const lastName = mapping?.lastName ?? authorInline?.lastName ?? "";
				const username =
					mapping?.curiusUsername ?? authorInline?.userLink ?? undefined;
				const displayName =
					`${firstName} ${lastName}`.trim() || username || "Someone";

				const parsedHlTime = hl.createdDate ? Date.parse(hl.createdDate) : NaN;
				const creationTime = Number.isFinite(parsedHlTime)
					? parsedHlTime
					: entryCreationTime;

				items.push({
					_id: `curius:${hl.id}`,
					_creationTime: creationTime,
					url: entry.link,
					text,
					user: {
						_id: mapping?.glossUserId ?? `curius:${authorId}`,
						name: displayName,
						username,
					},
					source: "curius",
					externalId: hl.id,
				});
			}
		} else {
			const primary = entry.users[0];
			if (!primary) continue;

			const mapping = mappings[primary.id];
			const firstName = mapping?.firstName ?? primary.firstName ?? "";
			const lastName = mapping?.lastName ?? primary.lastName ?? "";
			const username = mapping?.curiusUsername ?? primary.userLink ?? undefined;
			const displayName =
				`${firstName} ${lastName}`.trim() || username || "Someone";

			items.push({
				_id: `curius:${entry.id}`,
				_creationTime: entryCreationTime,
				url: entry.link,
				title: entry.title ?? undefined,
				user: {
					_id: mapping?.glossUserId ?? `curius:${primary.id}`,
					name: displayName,
					username,
				},
				source: "curius",
				externalId: entry.id,
			});
		}
	}

	items.sort((a, b) => b._creationTime - a._creationTime);
	if (items.length > limit) items.length = limit;
	return items;
}
