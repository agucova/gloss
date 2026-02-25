import { Bookmark } from "lucide-react";

import type { Bookmark as BookmarkType } from "../types";

interface BookmarkCardProps {
	bookmark: BookmarkType;
}

const WWW_REGEX = /^www\./;

/**
 * Extract domain from URL for display.
 */
function getDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(WWW_REGEX, "");
	} catch {
		return url;
	}
}

/**
 * A card displaying a bookmarked link in the Read Later section.
 * Gallery-style with subtle border, minimal shadow.
 */
export function BookmarkCard({ bookmark }: BookmarkCardProps) {
	const domain = getDomain(bookmark.url);
	const title = bookmark.title || domain;

	return (
		<a
			className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:border-border/80 hover:shadow-sm"
			href={bookmark.url}
			rel="noopener noreferrer"
			target="_blank"
		>
			<div className="mb-2 flex items-center gap-2">
				<Bookmark className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
				<span className="truncate text-xs text-muted-foreground/70">
					{domain}
				</span>
			</div>
			<h3 className="line-clamp-2 text-sm leading-snug font-medium text-foreground">
				{title}
			</h3>
		</a>
	);
}
