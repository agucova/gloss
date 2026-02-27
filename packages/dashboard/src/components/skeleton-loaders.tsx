/** @jsxImportSource react */
import { cn } from "../utils/cn";

interface SkeletonProps {
	className?: string;
}

function Skeleton({ className }: SkeletonProps) {
	return (
		<div
			aria-hidden="true"
			className={cn("animate-pulse rounded-md bg-muted", className)}
		/>
	);
}

/**
 * Skeleton loader for a single link activity item.
 */
export function ActivityItemSkeleton() {
	return (
		<div className="flex items-start gap-3 px-2 py-2.5">
			<Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex items-baseline justify-between gap-3">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-3 w-14" />
				</div>
				<Skeleton className="h-4 w-3/4" />
			</div>
		</div>
	);
}

/**
 * Skeleton loader for Recent Links section.
 */
export function RecentLinksSkeleton() {
	return (
		<div className="-mx-2 divide-y divide-border/50">
			<ActivityItemSkeleton />
			<ActivityItemSkeleton />
			<ActivityItemSkeleton />
			<ActivityItemSkeleton />
		</div>
	);
}

/**
 * Skeleton loader for a highlight item with text.
 */
export function HighlightItemSkeleton() {
	return (
		<div className="rounded-lg bg-amber-50/50 p-3 dark:bg-amber-950/30">
			<div className="mb-1.5 flex items-center justify-between gap-3">
				<div className="flex items-center gap-1.5">
					<Skeleton className="h-3 w-14" />
					<Skeleton className="h-3 w-20" />
				</div>
				<div className="flex items-center gap-2">
					<Skeleton className="h-3 w-16" />
					<Skeleton className="size-2 rounded-full" />
				</div>
			</div>
			<Skeleton className="h-10 w-full rounded-md" />
		</div>
	);
}

/**
 * Skeleton loader for Recent Highlights section.
 */
export function RecentHighlightsSkeleton() {
	return (
		<div className="space-y-3">
			<HighlightItemSkeleton />
			<HighlightItemSkeleton />
			<HighlightItemSkeleton />
		</div>
	);
}

/**
 * Skeleton loader for a bookmark card.
 */
export function BookmarkCardSkeleton() {
	return (
		<div className="flex w-56 shrink-0 flex-col rounded-xl border border-border bg-card p-4">
			<div className="mb-2 flex items-center gap-2">
				<Skeleton className="size-3.5 rounded" />
				<Skeleton className="h-3 w-20" />
			</div>
			<Skeleton className="mb-1 h-4 w-full" />
			<Skeleton className="h-4 w-2/3" />
		</div>
	);
}

/**
 * Skeleton loader for Read Later section.
 */
export function ReadLaterSkeleton() {
	return (
		<div className="-mx-6 flex gap-4 overflow-hidden px-6">
			<BookmarkCardSkeleton />
			<BookmarkCardSkeleton />
			<BookmarkCardSkeleton />
		</div>
	);
}
