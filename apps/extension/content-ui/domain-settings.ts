/**
 * Storage utilities for domain-level settings (indicator corner, disabled domains).
 */

export type IndicatorCorner =
	| "top-right"
	| "top-left"
	| "bottom-right"
	| "bottom-left";

const INDICATOR_CORNER_KEY = "glossIndicatorCorner";
const DISABLED_DOMAINS_KEY = "glossDisabledDomains";
const DEFAULT_CORNER: IndicatorCorner = "top-right";
const WWW_PREFIX = /^www\./;

export async function loadIndicatorCorner(): Promise<IndicatorCorner> {
	try {
		const result = await browser.storage.sync.get(INDICATOR_CORNER_KEY);
		return (result[INDICATOR_CORNER_KEY] as IndicatorCorner) || DEFAULT_CORNER;
	} catch {
		return DEFAULT_CORNER;
	}
}

export async function saveIndicatorCorner(
	corner: IndicatorCorner
): Promise<void> {
	try {
		await browser.storage.sync.set({ [INDICATOR_CORNER_KEY]: corner });
	} catch (error) {
		console.error("[Gloss] Failed to save indicator corner:", error);
	}
}

export async function loadDisabledDomains(): Promise<string[]> {
	try {
		const result = await browser.storage.sync.get(DISABLED_DOMAINS_KEY);
		return (result[DISABLED_DOMAINS_KEY] as string[]) || [];
	} catch {
		return [];
	}
}

export async function saveDisabledDomains(domains: string[]): Promise<void> {
	await browser.storage.sync.set({ [DISABLED_DOMAINS_KEY]: domains });
}

export async function isDomainDisabled(): Promise<boolean> {
	const domain = location.hostname.replace(WWW_PREFIX, "");
	const domains = await loadDisabledDomains();
	return domains.includes(domain);
}

export async function disableCurrentDomain(): Promise<void> {
	const domain = location.hostname.replace(WWW_PREFIX, "");
	const domains = await loadDisabledDomains();
	if (!domains.includes(domain)) {
		domains.push(domain);
		await saveDisabledDomains(domains);
	}
}
