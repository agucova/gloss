import { Clock, Star } from "lucide-react";

import { cn } from "@/lib/utils";

interface Tag {
	id: string;
	name: string;
	color: string | null;
	isSystem: boolean;
	bookmarkCount: number;
}

interface TagFilterPillsProps {
	tags: Tag[];
	selectedTagId: string | null;
	onSelectTag: (tagId: string | null) => void;
	isLoading?: boolean;
}

export function TagFilterPills({
	tags,
	selectedTagId,
	onSelectTag,
	isLoading,
}: TagFilterPillsProps) {
	if (isLoading) {
		return (
			<div className="mb-4 flex gap-2">
				{[1, 2, 3].map((i) => (
					<div
						className="h-7 w-16 animate-pulse rounded-full bg-muted"
						key={i}
					/>
				))}
			</div>
		);
	}

	if (tags.length === 0) {
		return null;
	}

	return (
		<div className="relative mb-4">
			{/* Gradient fade at edges */}
			<div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-8 bg-gradient-to-l from-background to-transparent" />

			{/* Scrollable pills container */}
			<div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
				{/* "All" pill */}
				<button
					className={cn(
						"shrink-0 rounded-full px-3 py-1.5 font-medium text-xs transition-colors",
						selectedTagId === null
							? "bg-foreground text-background"
							: "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
					)}
					onClick={() => onSelectTag(null)}
					type="button"
				>
					All
				</button>

				{/* Tag pills */}
				{tags.map((tag) => (
					<TagPill
						isSelected={selectedTagId === tag.id}
						key={tag.id}
						onClick={() =>
							onSelectTag(selectedTagId === tag.id ? null : tag.id)
						}
						tag={tag}
					/>
				))}
			</div>
		</div>
	);
}

interface TagPillProps {
	tag: Tag;
	isSelected: boolean;
	onClick: () => void;
}

function TagPill({ tag, isSelected, onClick }: TagPillProps) {
	const isSystemTag = tag.isSystem;
	const isFavorites = tag.name === "favorites";
	const isToRead = tag.name === "to-read";

	return (
		<button
			className={cn(
				"flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-xs transition-colors",
				isSelected
					? "bg-foreground text-background"
					: "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
			)}
			onClick={onClick}
			type="button"
		>
			{/* Icon for system tags, colored dot for custom tags */}
			{isSystemTag ? (
				isFavorites ? (
					<Star
						className="h-3 w-3"
						fill={isSelected ? "currentColor" : (tag.color ?? "currentColor")}
						style={{ color: isSelected ? undefined : (tag.color ?? undefined) }}
					/>
				) : isToRead ? (
					<Clock
						className="h-3 w-3"
						style={{ color: isSelected ? undefined : (tag.color ?? undefined) }}
					/>
				) : null
			) : (
				<span
					className="h-2 w-2 shrink-0 rounded-full"
					style={{
						backgroundColor: isSelected
							? "currentColor"
							: (tag.color ?? "currentColor"),
					}}
				/>
			)}

			{/* Tag name */}
			<span>{tag.name === "to-read" ? "To Read" : tag.name}</span>

			{/* Bookmark count */}
			<span
				className={cn(
					"tabular-nums",
					isSelected ? "text-background/70" : "text-muted-foreground/50"
				)}
			>
				{tag.bookmarkCount}
			</span>
		</button>
	);
}
