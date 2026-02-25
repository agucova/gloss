import { Bookmark, ExternalLink, Star, Trash2 } from "lucide-react";

import { formatRelativeTime, getDomain } from "@/components/cards/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ReadLaterBookmark {
	id: string;
	url: string;
	title: string | null;
	description: string | null;
	favicon: string | null;
	createdAt: Date | string;
	tags?: Array<{
		id: string;
		name: string;
		color: string | null;
		isSystem: boolean;
	}>;
}

interface ReadLaterRowProps {
	bookmark: ReadLaterBookmark;
	onDelete: (id: string) => void;
	onToggleFavorite: (id: string) => void;
}

export function ReadLaterRow({
	bookmark,
	onDelete,
	onToggleFavorite,
}: ReadLaterRowProps) {
	const domain = getDomain(bookmark.url);
	const title = bookmark.title || domain;
	const isFavorited =
		bookmark.tags?.some((t) => t.name === "favorites") ?? false;
	const nonSystemTags =
		bookmark.tags?.filter((t) => !t.isSystem).slice(0, 2) ?? [];

	return (
		<div className="group flex items-center gap-3 rounded-md px-4 py-2.5 transition-colors hover:bg-muted/50">
			{/* Favicon */}
			{bookmark.favicon ? (
				<img
					alt=""
					className="mt-0.5 h-4 w-4 shrink-0 rounded-sm"
					height={16}
					onError={(e) => {
						const img = e.currentTarget;
						img.style.display = "none";
						const fallback = img.nextElementSibling as HTMLElement | null;
						if (fallback) fallback.style.display = "";
					}}
					src={bookmark.favicon}
					width={16}
				/>
			) : null}
			<Bookmark
				className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40"
				style={bookmark.favicon ? { display: "none" } : undefined}
			/>

			{/* Content */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<h3 className="min-w-0 truncate text-sm font-medium text-foreground">
						{title}
					</h3>
					<span className="shrink-0 text-xs text-muted-foreground/60">
						{domain}
					</span>
					<span className="shrink-0 text-xs text-muted-foreground/40">
						&middot;
					</span>
					<span className="shrink-0 text-xs text-muted-foreground/60">
						{formatRelativeTime(bookmark.createdAt)}
					</span>
					{nonSystemTags.map((tag) => (
						<span
							className="h-1.5 w-1.5 shrink-0 rounded-full"
							key={tag.id}
							style={{
								backgroundColor: tag.color ?? "currentColor",
							}}
						/>
					))}
				</div>
				{bookmark.description && (
					<p className="mt-0.5 truncate text-xs text-muted-foreground/70">
						{bookmark.description}
					</p>
				)}
			</div>

			{/* Action buttons */}
			<div className="flex shrink-0 items-center gap-0.5">
				<Button
					aria-label={
						isFavorited ? "Remove from favorites" : "Add to favorites"
					}
					className={cn(
						"h-7 w-7",
						!isFavorited &&
							"opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
					)}
					onClick={() => onToggleFavorite(bookmark.id)}
					size="icon-xs"
					variant="ghost"
				>
					<Star
						className={cn(
							"h-3.5 w-3.5",
							isFavorited && "fill-amber-400 text-amber-400"
						)}
					/>
				</Button>
				<Button
					aria-label="Open in new tab"
					className="h-7 w-7 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
					onClick={() =>
						window.open(bookmark.url, "_blank", "noopener,noreferrer")
					}
					size="icon-xs"
					variant="ghost"
				>
					<ExternalLink className="h-3.5 w-3.5" />
				</Button>
				<Button
					aria-label="Remove bookmark"
					className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive"
					onClick={() => onDelete(bookmark.id)}
					size="icon-xs"
					variant="ghost"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</Button>
			</div>
		</div>
	);
}
