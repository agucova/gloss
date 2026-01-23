import { Bookmark, Clock, Star } from "lucide-react";

import { formatRelativeTime, getDomain } from "./utils";

export interface BookmarkTag {
	id: string;
	name: string;
	color: string | null;
	isSystem: boolean;
}

export interface BookmarkCardProps {
	bookmark: {
		id: string;
		url: string;
		title: string | null;
		description: string | null;
		favicon: string | null;
		createdAt: Date | string;
		tags?: BookmarkTag[];
	};
}

export function BookmarkCard({ bookmark }: BookmarkCardProps) {
	const domain = getDomain(bookmark.url);
	const title = bookmark.title || domain;
	const tags = bookmark.tags ?? [];

	return (
		<a
			className="group flex items-start gap-3 rounded-md px-4 py-3 transition-colors hover:bg-muted/50"
			href={bookmark.url}
			rel="noopener noreferrer"
			target="_blank"
		>
			{bookmark.favicon ? (
				<img
					alt=""
					className="mt-0.5 h-4 w-4 shrink-0 rounded-sm"
					height={16}
					src={bookmark.favicon}
					width={16}
				/>
			) : (
				<Bookmark className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
			)}
			<div className="min-w-0 flex-1">
				<h3 className="truncate font-medium text-foreground text-sm">
					{title}
				</h3>
				{bookmark.description && (
					<p className="mt-0.5 line-clamp-1 text-muted-foreground/80 text-sm">
						{bookmark.description}
					</p>
				)}
				<div className="mt-1.5 flex items-center gap-2 text-muted-foreground/60 text-xs">
					<span className="min-w-0 truncate">{domain}</span>
					<span className="shrink-0">·</span>
					<span className="shrink-0">
						{formatRelativeTime(bookmark.createdAt)}
					</span>
				</div>
				{tags.length > 0 && (
					<div className="mt-2 flex items-center gap-1.5 overflow-hidden">
						{tags.slice(0, 3).map((tag) => (
							<TagIndicator key={tag.id} tag={tag} />
						))}
						{tags.length > 3 && (
							<span className="shrink-0 text-muted-foreground/50 text-xs">
								+{tags.length - 3}
							</span>
						)}
					</div>
				)}
			</div>
		</a>
	);
}

function TagIndicator({ tag }: { tag: BookmarkTag }) {
	const isFavorites = tag.name === "favorites";
	const isToRead = tag.name === "to-read";

	if (tag.isSystem) {
		if (isFavorites) {
			return (
				<Star
					className="h-3 w-3"
					fill={tag.color ?? "currentColor"}
					style={{ color: tag.color ?? undefined }}
				/>
			);
		}
		if (isToRead) {
			return (
				<Clock className="h-3 w-3" style={{ color: tag.color ?? undefined }} />
			);
		}
		return null;
	}

	return (
		<span className="flex items-center gap-1 text-muted-foreground/60 text-xs">
			<span
				className="h-1.5 w-1.5 shrink-0 rounded-full"
				style={{ backgroundColor: tag.color ?? "currentColor" }}
			/>
			<span className="max-w-16 truncate">{tag.name}</span>
		</span>
	);
}
