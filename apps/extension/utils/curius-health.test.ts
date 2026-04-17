import { describe, expect, test } from "bun:test";

import {
	curiusHealth,
	formatExpiryCountdown,
	RECONNECT_WINDOW_MS,
} from "./curius-health";

const NOW = 1_800_000_000_000; // ms epoch, mid-2027 — far from any real date we'd hit

describe("curiusHealth", () => {
	test("returns expired when the last import failed with token_expired", () => {
		expect(
			curiusHealth(
				{
					tokenExpiresAt: NOW + 365 * 24 * 60 * 60 * 1000,
					lastImportError: "token_expired",
				},
				NOW
			)
		).toBe("expired");
	});

	test("returns expired when tokenExpiresAt is already in the past", () => {
		expect(
			curiusHealth({ tokenExpiresAt: NOW - 1, lastImportError: undefined }, NOW)
		).toBe("expired");
	});

	test("returns expiring-soon within the reconnect window", () => {
		expect(
			curiusHealth(
				{
					tokenExpiresAt: NOW + RECONNECT_WINDOW_MS - 1000,
					lastImportError: undefined,
				},
				NOW
			)
		).toBe("expiring-soon");
	});

	test("returns healthy when expiry is comfortably in the future", () => {
		expect(
			curiusHealth(
				{
					tokenExpiresAt: NOW + 2 * RECONNECT_WINDOW_MS,
					lastImportError: undefined,
				},
				NOW
			)
		).toBe("healthy");
	});

	test("treats unknown expiry as healthy (old rows predate the field)", () => {
		expect(
			curiusHealth(
				{ tokenExpiresAt: undefined, lastImportError: undefined },
				NOW
			)
		).toBe("healthy");
	});
});

describe("formatExpiryCountdown", () => {
	test("returns null when expiry is unknown", () => {
		expect(formatExpiryCountdown(undefined, NOW)).toBeNull();
	});

	test("says 'expired' when the timestamp is in the past", () => {
		expect(formatExpiryCountdown(NOW - 1000, NOW)).toBe(
			"Curius session expired"
		);
	});

	test("says 'under a day' when less than 24h remain", () => {
		expect(formatExpiryCountdown(NOW + 60 * 60 * 1000, NOW)).toBe(
			"Expires in under a day"
		);
	});

	test("rounds up to whole days", () => {
		expect(
			formatExpiryCountdown(NOW + 3 * 24 * 60 * 60 * 1000 + 1000, NOW)
		).toBe("Expires in 4 days");
	});
});
