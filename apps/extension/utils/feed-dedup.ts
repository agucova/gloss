/**
 * Tracks which highlights are currently on-screen from each source so that
 * native Gloss highlights always win over Curius-bridged ones — regardless
 * of which arrives first. The two render paths fire independently
 * (`LOAD_HIGHLIGHTS` vs. `LOAD_CURIUS_BRIDGE`), so the dedup has to work in
 * both orders:
 *
 * - Native first, bridge second: bridge item is skipped if its externalId
 *   already appears on a native row.
 * - Bridge first, native second: the bridge copy is torn down and replaced
 *   by the higher-fidelity native copy (which has full range/position
 *   selectors).
 *
 * State is per-page-view; call {@link FeedDedup.reset} when SPA navigation
 * clears the highlight manager.
 */
export interface HighlightRemover {
	remove(id: string): boolean;
}

export class FeedDedup {
	private readonly nativeExternalIds = new Set<string>();
	private readonly bridgeIdByExternalId = new Map<string, string>();

	/** Clear all tracking — used on SPA navigation alongside `manager.clear()`. */
	reset(): void {
		this.nativeExternalIds.clear();
		this.bridgeIdByExternalId.clear();
	}

	/**
	 * Record a native highlight. If a bridge copy with the same externalId
	 * is already on-screen, it's removed from the DOM via `manager.remove`.
	 * Safe to call with `undefined` (native highlights without an externalId
	 * simply don't participate in dedup).
	 */
	onNativeHighlight(
		externalId: string | undefined,
		manager: HighlightRemover
	): void {
		if (!externalId) return;
		this.nativeExternalIds.add(externalId);
		const bridgeId = this.bridgeIdByExternalId.get(externalId);
		if (bridgeId) {
			manager.remove(bridgeId);
			this.bridgeIdByExternalId.delete(externalId);
		}
	}

	/**
	 * Decide whether a bridge highlight should render. Returns false if the
	 * externalId is already covered by a native row. Returns true and
	 * records the tracker otherwise, so a later native arrival can evict
	 * the bridge copy.
	 */
	shouldRenderBridge(externalId: string, bridgeId: string): boolean {
		if (this.nativeExternalIds.has(externalId)) return false;
		this.bridgeIdByExternalId.set(externalId, bridgeId);
		return true;
	}
}
