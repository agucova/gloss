/** @jsxImportSource react */
import { useAction } from "convex/react";
import { useEffect, useState } from "react";

import type { CuriusBridgeBookmark, CuriusBridgeHighlight } from "../types";

import { api } from "../../../../convex/_generated/api";

type FeedKind = "highlights" | "bookmarks";

type Result<K extends FeedKind> = K extends "highlights"
	? CuriusBridgeHighlight[]
	: CuriusBridgeBookmark[];

/**
 * Fetch the authenticated user's Curius friend feed once per mount. Kept
 * simple — no reactive subscription (actions aren't reactive in Convex), no
 * background polling. Re-runs when `kind` or `limit` change. Errors are
 * swallowed so the bridge can never break the native dashboard feed.
 */
export function useCuriusFriendFeed<K extends FeedKind>(
	kind: K,
	limit: number
): { items: Result<K>; loading: boolean } {
	const runAction = useAction(api.curius.getFriendFeed);
	const [items, setItems] = useState<Result<K>>([] as unknown as Result<K>);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		runAction({ kind, limit })
			.then((response) => {
				if (cancelled) return;
				setItems((response.items ?? []) as unknown as Result<K>);
			})
			.catch((error) => {
				if (cancelled) return;
				// Bridge failures are intentionally silent at the UI layer.
				console.warn("[Gloss] Curius friend feed failed:", error);
				setItems([] as unknown as Result<K>);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [runAction, kind, limit]);

	return { items, loading };
}
