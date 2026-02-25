import Table from "cli-table3";

import type { Bookmark, Highlight, SearchResult, Tag } from "./api-client.js";

export type OutputFormat = "json" | "table" | "csv" | "markdown";

/**
 * Format data as JSON.
 */
export function formatJson(data: unknown): string {
	return JSON.stringify(data, null, 2);
}

/**
 * Escape a value for CSV output.
 */
function escapeCSV(value: string | null | undefined): string {
	if (value === null || value === undefined) {
		return "";
	}
	const str = String(value);
	if (str.includes(",") || str.includes('"') || str.includes("\n")) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/**
 * Format data as CSV.
 */
export function formatCSV(
	headers: string[],
	rows: (string | null | undefined)[][]
): string {
	const headerLine = headers.join(",");
	const dataLines = rows.map((row) => row.map(escapeCSV).join(","));
	return [headerLine, ...dataLines].join("\n");
}

/**
 * Truncate text to a maximum length.
 */
function truncate(text: string | null | undefined, maxLength: number): string {
	if (!text) return "";
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Format a date string for display.
 */
function formatDate(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/**
 * Format highlights as a table.
 */
export function formatHighlightsTable(highlights: Highlight[]): string {
	const table = new Table({
		head: ["ID", "Text", "URL", "Visibility", "Created"],
		colWidths: [12, 40, 30, 12, 15],
		wordWrap: true,
	});

	for (const h of highlights) {
		table.push([
			h.id.slice(0, 10),
			truncate(h.text, 80),
			truncate(h.url, 40),
			h.visibility,
			formatDate(h.createdAt),
		]);
	}

	return table.toString();
}

/**
 * Format highlights as CSV.
 */
export function formatHighlightsCSV(highlights: Highlight[]): string {
	const headers = ["id", "text", "url", "visibility", "createdAt"];
	const rows = highlights.map((h) => [
		h.id,
		h.text,
		h.url,
		h.visibility,
		h.createdAt,
	]);
	return formatCSV(headers, rows);
}

/**
 * Format highlights as Markdown.
 */
export function formatHighlightsMarkdown(highlights: Highlight[]): string {
	return highlights
		.map(
			(h) =>
				`## Highlight\n\n> ${h.text}\n\n- **URL**: ${h.url}\n- **Visibility**: ${h.visibility}\n- **Created**: ${formatDate(h.createdAt)}\n`
		)
		.join("\n---\n\n");
}

/**
 * Format bookmarks as a table.
 */
export function formatBookmarksTable(bookmarks: Bookmark[]): string {
	const table = new Table({
		head: ["ID", "Title", "URL", "Tags", "Created"],
		colWidths: [12, 30, 35, 20, 15],
		wordWrap: true,
	});

	for (const b of bookmarks) {
		const tagNames = (b.tags ?? []).map((t) => t.name).join(", ");
		table.push([
			b.id.slice(0, 10),
			truncate(b.title, 50) || "(no title)",
			truncate(b.url, 50),
			truncate(tagNames, 30),
			formatDate(b.createdAt),
		]);
	}

	return table.toString();
}

/**
 * Format bookmarks as CSV.
 */
export function formatBookmarksCSV(bookmarks: Bookmark[]): string {
	const headers = ["id", "title", "url", "description", "tags", "createdAt"];
	const rows = bookmarks.map((b) => [
		b.id,
		b.title,
		b.url,
		b.description,
		(b.tags ?? []).map((t) => t.name).join(";"),
		b.createdAt,
	]);
	return formatCSV(headers, rows);
}

/**
 * Format bookmarks as Markdown.
 */
export function formatBookmarksMarkdown(bookmarks: Bookmark[]): string {
	return bookmarks
		.map((b) => {
			const tagStr =
				(b.tags ?? []).length > 0
					? `- **Tags**: ${(b.tags ?? []).map((t) => `\`${t.name}\``).join(", ")}\n`
					: "";
			const descStr = b.description ? `\n${b.description}\n` : "";
			return `## [${b.title || b.url}](${b.url})\n${descStr}${tagStr}- **Created**: ${formatDate(b.createdAt)}\n`;
		})
		.join("\n---\n\n");
}

/**
 * Format tags as a table.
 */
export function formatTagsTable(tags: Tag[]): string {
	const table = new Table({
		head: ["ID", "Name", "Color", "System"],
		colWidths: [30, 25, 15, 10],
	});

	for (const t of tags) {
		table.push([t.id, t.name, t.color || "-", t.isSystem ? "Yes" : "No"]);
	}

	return table.toString();
}

/**
 * Format tags as CSV.
 */
export function formatTagsCSV(tags: Tag[]): string {
	const headers = ["id", "name", "color", "isSystem"];
	const rows = tags.map((t) => [
		t.id,
		t.name,
		t.color,
		t.isSystem ? "true" : "false",
	]);
	return formatCSV(headers, rows);
}

/**
 * Format search results as a table.
 */
export function formatSearchTable(results: SearchResult[]): string {
	const table = new Table({
		head: ["Type", "ID", "Content", "Score", "Created"],
		colWidths: [12, 12, 50, 10, 15],
		wordWrap: true,
	});

	for (const r of results) {
		const content =
			r.type === "highlight"
				? r.text
				: r.type === "bookmark"
					? r.title || r.url
					: r.content;
		table.push([
			r.type,
			r.id.slice(0, 10),
			truncate(content, 80),
			r.score.toFixed(2),
			formatDate(r.createdAt),
		]);
	}

	return table.toString();
}

/**
 * Format search results as CSV.
 */
export function formatSearchCSV(results: SearchResult[]): string {
	const headers = [
		"type",
		"id",
		"content",
		"url",
		"score",
		"ftsScore",
		"semanticScore",
		"createdAt",
	];
	const rows = results.map((r) => {
		const content =
			r.type === "highlight"
				? r.text
				: r.type === "bookmark"
					? r.title || r.description
					: r.content;
		return [
			r.type,
			r.id,
			content,
			r.url,
			r.score.toString(),
			r.ftsScore.toString(),
			r.semanticScore.toString(),
			r.createdAt,
		];
	});
	return formatCSV(headers, rows);
}

/**
 * Format search results as Markdown.
 */
export function formatSearchMarkdown(results: SearchResult[]): string {
	return results
		.map((r) => {
			if (r.type === "highlight") {
				return `## Highlight (score: ${r.score.toFixed(2)})\n\n> ${r.text}\n\n- **URL**: ${r.url}\n- **Created**: ${formatDate(r.createdAt)}\n`;
			}
			if (r.type === "bookmark") {
				return `## Bookmark (score: ${r.score.toFixed(2)})\n\n**[${r.title || r.url}](${r.url})**\n${r.description ? `\n${r.description}\n` : ""}\n- **Created**: ${formatDate(r.createdAt)}\n`;
			}
			return `## Comment (score: ${r.score.toFixed(2)})\n\n${r.content}\n\n- **Created**: ${formatDate(r.createdAt)}\n`;
		})
		.join("\n---\n\n");
}
