/**
 * Merge native Gloss feed items with Curius-bridged items. Native always
 * wins on dedup: if a bridge item has an `externalId` that already appears
 * on a native row (e.g., because the Gloss user imported that highlight),
 * the bridge copy is dropped. The native version anchors more reliably
 * (full range/position selector) and links to the friend's Gloss profile
 * when they've migrated.
 *
 * Items are interleaved by `_creationTime` descending, then capped at
 * `limit`.
 */

export interface FeedItemLike {
	_id: string;
	_creationTime: number;
	externalId?: string;
	source?: "gloss" | "curius";
}

export function mergeFeeds<T extends FeedItemLike>(
	native: readonly T[] | undefined,
	bridged: readonly T[] | undefined,
	limit: number
): T[] {
	const nativeExternalIds = new Set<string>();
	if (native) {
		for (const item of native) {
			if (item.externalId) nativeExternalIds.add(item.externalId);
		}
	}

	const merged: T[] = [];
	if (native) {
		for (const item of native) {
			merged.push(item);
		}
	}
	if (bridged) {
		for (const item of bridged) {
			if (item.externalId && nativeExternalIds.has(item.externalId)) continue;
			merged.push(item);
		}
	}

	merged.sort((a, b) => b._creationTime - a._creationTime);
	if (merged.length > limit) merged.length = limit;
	return merged;
}
