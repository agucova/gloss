/**
 * Fuzzy string matching utilities using approx-string-match.
 * Used as a fallback when exact text matching fails.
 */

import search, { type Match } from "approx-string-match";
import { normalizeText } from "./text";

/**
 * Result of a fuzzy match with scoring.
 */
export interface FuzzyMatch {
	/** Start index in the text */
	start: number;
	/** End index in the text */
	end: number;
	/** Number of edit errors in the match */
	errors: number;
	/** Computed score (higher is better) */
	score: number;
}

/**
 * Find approximate matches for a pattern in text.
 *
 * @param text - The text to search in
 * @param pattern - The pattern to find
 * @param maxErrors - Maximum number of edit errors allowed
 * @returns Array of matches, sorted by score (best first)
 */
export function fuzzySearch(
	text: string,
	pattern: string,
	maxErrors: number
): FuzzyMatch[] {
	if (!pattern || pattern.length === 0) {
		return [];
	}

	// Normalize both text and pattern for consistent matching
	const normalizedText = normalizeText(text);
	const normalizedPattern = normalizeText(pattern);

	// Use approx-string-match library
	const matches: Match[] = search(normalizedText, normalizedPattern, maxErrors);

	return matches
		.map((match) => ({
			start: match.start,
			end: match.end,
			errors: match.errors,
			// Base score: lower errors = higher score
			score: 100 - match.errors * 10,
		}))
		.sort((a, b) => b.score - a.score);
}

/**
 * Find the best match using context (prefix/suffix) to disambiguate.
 *
 * @param text - The text to search in
 * @param exact - The exact text to find
 * @param prefix - Context before the text
 * @param suffix - Context after the text
 * @param maxErrors - Maximum errors for the main pattern
 * @param positionHint - Optional hint for expected position (prioritizes nearby matches)
 * @returns Best match or null if no match found
 */
export function fuzzySearchWithContext(
	text: string,
	exact: string,
	prefix: string,
	suffix: string,
	maxErrors: number,
	positionHint?: number
): FuzzyMatch | null {
	const matches = fuzzySearch(text, exact, maxErrors);

	if (matches.length === 0) {
		return null;
	}

	if (matches.length === 1) {
		return matches[0] ?? null;
	}

	// Score each match based on context alignment
	const scoredMatches = matches.map((match) => {
		let score = match.score;

		// Check prefix alignment (20% weight)
		if (prefix.length > 0) {
			const textBefore = text.slice(
				Math.max(0, match.start - prefix.length - 5),
				match.start
			);
			const prefixScore = scoreContextMatch(textBefore, prefix);
			score += prefixScore * 0.2;
		}

		// Check suffix alignment (20% weight)
		if (suffix.length > 0) {
			const textAfter = text.slice(match.end, match.end + suffix.length + 5);
			const suffixScore = scoreContextMatch(textAfter, suffix);
			score += suffixScore * 0.2;
		}

		// Position hint bonus (2% weight as tie-breaker)
		if (positionHint !== undefined) {
			const distance = Math.abs(match.start - positionHint);
			const maxDistance = text.length;
			const proximityScore = 100 * (1 - distance / maxDistance);
			score += proximityScore * 0.02;
		}

		return { ...match, score };
	});

	// Return best scored match
	scoredMatches.sort((a, b) => b.score - a.score);
	return scoredMatches[0] ?? null;
}

/**
 * Score how well a context string matches text.
 * Returns 0-100 where 100 is perfect match.
 */
function scoreContextMatch(text: string, context: string): number {
	if (!context || context.length === 0) {
		return 50; // Neutral score for empty context
	}

	const normalizedText = normalizeText(text);
	const normalizedContext = normalizeText(context);

	// Check for exact substring match
	if (normalizedText.includes(normalizedContext)) {
		return 100;
	}

	// Check for partial match (how much of context is in text)
	// Use Levenshtein-like comparison via fuzzy search
	const maxErrors = Math.ceil(normalizedContext.length * 0.3);
	const matches = fuzzySearch(normalizedText, normalizedContext, maxErrors);

	if (matches.length > 0 && matches[0]) {
		const bestMatch = matches[0];
		// Score based on error rate
		const errorRate = bestMatch.errors / normalizedContext.length;
		return Math.max(0, 100 - errorRate * 100);
	}

	return 0;
}

/**
 * Find exact match (no errors allowed).
 * Faster than fuzzy when we expect an exact match.
 */
export function exactSearch(text: string, pattern: string): number {
	const normalizedText = normalizeText(text);
	const normalizedPattern = normalizeText(pattern);
	return normalizedText.indexOf(normalizedPattern);
}

/**
 * Calculate the recommended max errors based on pattern length.
 * Uses ~10% of pattern length, with min of 2 and max of 20.
 */
export function recommendedMaxErrors(patternLength: number): number {
	const errors = Math.ceil(patternLength * 0.1);
	return Math.max(2, Math.min(20, errors));
}
