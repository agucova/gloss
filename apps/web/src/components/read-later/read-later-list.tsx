import type { Id } from "@convex/_generated/dataModel";

import { api } from "@convex/_generated/api";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMutation, usePaginatedQuery } from "convex/react";
import { Bookmark, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import Loader from "@/components/loader";

import type { ReadLaterBookmark } from "./read-later-row";

import { ReadLaterRow } from "./read-later-row";

interface ReadLaterListProps {
	userId: Id<"users">;
	searchQuery: string;
	selectedTagId: string | null;
	sortOrder: "asc" | "desc";
}

export function ReadLaterList({
	userId,
	searchQuery,
	selectedTagId,
	sortOrder,
}: ReadLaterListProps) {
	const parentRef = useRef<HTMLDivElement>(null);
	const pendingDeletes = useRef(
		new Map<string, ReturnType<typeof setTimeout>>()
	);
	const [optimisticallyDeleted, setOptimisticallyDeleted] = useState<
		Set<string>
	>(new Set());

	const bookmarksQuery = usePaginatedQuery(
		api.bookmarks.list,
		{
			paginationOpts: { numItems: 20 },
			...(searchQuery ? { search: searchQuery } : {}),
			...(selectedTagId ? { tagId: selectedTagId as Id<"tags"> } : {}),
		},
		{ initialNumItems: 20 }
	);

	const deleteBookmarkMutation = useMutation(api.bookmarks.remove);
	const toggleFavoriteMutation = useMutation(api.bookmarks.toggleFavorite);

	// Filter out optimistically deleted bookmarks
	const bookmarks = (bookmarksQuery.results ?? []).filter(
		(b) => !optimisticallyDeleted.has(b._id)
	);

	const canLoadMore = bookmarksQuery.status === "CanLoadMore";
	const isLoadingMore = bookmarksQuery.status === "LoadingMore";

	// Sort by creation time based on sortOrder
	const sortedBookmarks =
		sortOrder === "asc" ? [...bookmarks].reverse() : bookmarks;

	// Flush pending deletes on unmount
	useEffect(() => {
		const pending = pendingDeletes.current;
		return () => {
			for (const [bookmarkId, timeout] of pending) {
				clearTimeout(timeout);
				deleteBookmarkMutation({ id: bookmarkId as Id<"bookmarks"> });
			}
			pending.clear();
		};
	}, [deleteBookmarkMutation]);

	function handleDelete(bookmarkId: string) {
		// Optimistically hide the bookmark
		setOptimisticallyDeleted((prev) => new Set([...prev, bookmarkId]));

		// Schedule actual delete after 5s (allows undo)
		const timeout = setTimeout(() => {
			pendingDeletes.current.delete(bookmarkId);
			deleteBookmarkMutation({ id: bookmarkId as Id<"bookmarks"> }).catch(
				() => {
					toast.error("Failed to remove bookmark");
					setOptimisticallyDeleted((prev) => {
						const next = new Set(prev);
						next.delete(bookmarkId);
						return next;
					});
				}
			);
		}, 5000);
		pendingDeletes.current.set(bookmarkId, timeout);

		toast("Bookmark removed", {
			duration: 5000,
			action: {
				label: "Undo",
				onClick: () => {
					const pending = pendingDeletes.current.get(bookmarkId);
					if (pending) {
						clearTimeout(pending);
						pendingDeletes.current.delete(bookmarkId);
					}
					setOptimisticallyDeleted((prev) => {
						const next = new Set(prev);
						next.delete(bookmarkId);
						return next;
					});
				},
			},
		});
	}

	function handleToggleFavorite(bookmarkId: string) {
		toggleFavoriteMutation({ id: bookmarkId as Id<"bookmarks"> }).catch(() => {
			toast.error("Failed to update favorite");
		});
	}

	const virtualizer = useVirtualizer({
		count: canLoadMore ? sortedBookmarks.length + 1 : sortedBookmarks.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 72,
		overscan: 5,
		measureElement: (element) => element.getBoundingClientRect().height,
	});

	const virtualItems = virtualizer.getVirtualItems();

	useEffect(() => {
		const lastItem = virtualItems.at(-1);
		if (!lastItem) return;

		if (
			lastItem.index >= sortedBookmarks.length - 1 &&
			canLoadMore &&
			!isLoadingMore
		) {
			bookmarksQuery.loadMore(20);
		}
	}, [
		virtualItems,
		sortedBookmarks.length,
		canLoadMore,
		isLoadingMore,
		bookmarksQuery,
	]);

	if (bookmarksQuery.status === "LoadingFirstPage") {
		return (
			<div className="flex justify-center py-12">
				<Loader />
			</div>
		);
	}

	if (sortedBookmarks.length === 0) {
		if (searchQuery) {
			return (
				<div className="py-12 text-center">
					<Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
					<p className="text-sm text-muted-foreground">
						No bookmarks matching &ldquo;{searchQuery}&rdquo;
					</p>
				</div>
			);
		}
		if (selectedTagId) {
			return (
				<div className="py-12 text-center">
					<Bookmark className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
					<p className="text-sm text-muted-foreground">
						No bookmarks with this tag
					</p>
				</div>
			);
		}
		return (
			<div className="py-12 text-center">
				<Bookmark className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
				<p className="mb-1 text-sm text-foreground">No bookmarks yet</p>
				<p className="text-xs text-muted-foreground">
					Save pages with the browser extension to read later
				</p>
			</div>
		);
	}

	return (
		<div className="h-[calc(100vh-16rem)] overflow-auto" ref={parentRef}>
			<div
				className="relative w-full"
				style={{ height: `${virtualizer.getTotalSize()}px` }}
			>
				{virtualItems.map((virtualRow) => {
					const isLoaderRow = virtualRow.index >= sortedBookmarks.length;
					const bookmark = sortedBookmarks[virtualRow.index];

					return (
						<div
							className="absolute top-0 left-0 w-full"
							data-index={virtualRow.index}
							key={virtualRow.key}
							ref={virtualizer.measureElement}
							style={{
								transform: `translateY(${virtualRow.start}px)`,
							}}
						>
							{isLoaderRow ? (
								canLoadMore && (
									<div className="flex justify-center py-4">
										<Loader />
									</div>
								)
							) : bookmark ? (
								<ReadLaterRow
									bookmark={bookmark as ReadLaterBookmark}
									onDelete={handleDelete}
									onToggleFavorite={handleToggleFavorite}
								/>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}
