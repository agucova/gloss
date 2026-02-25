import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Bookmark, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { api } from "@/utils/api";

import type { ReadLaterBookmark } from "./read-later-row";

import { ReadLaterRow } from "./read-later-row";

interface ReadLaterListProps {
	userId: string;
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
	const queryClient = useQueryClient();
	const pendingDeletes = useRef(
		new Map<string, ReturnType<typeof setTimeout>>()
	);

	const queryKey = [
		"read-later",
		userId,
		searchQuery,
		selectedTagId,
		sortOrder,
	] as const;

	const {
		data,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading,
		error,
	} = useInfiniteQuery({
		queryKey,
		queryFn: async ({ pageParam }) => {
			const { data, error } = await api.api.users({ userId }).bookmarks.get({
				query: {
					cursor: pageParam,
					limit: 20,
					...(searchQuery ? { q: searchQuery } : {}),
					...(selectedTagId ? { tagId: selectedTagId } : {}),
					...(sortOrder !== "desc" ? { order: sortOrder } : {}),
				},
			});
			if (error) throw new Error("Failed to fetch bookmarks");
			return data;
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
	});

	const bookmarks: ReadLaterBookmark[] =
		data?.pages.flatMap((page) => (page?.items as ReadLaterBookmark[]) ?? []) ??
		[];

	// Flush pending deletes on unmount
	useEffect(() => {
		const pending = pendingDeletes.current;
		return () => {
			for (const [bookmarkId, timeout] of pending) {
				clearTimeout(timeout);
				api.api.bookmarks({ id: bookmarkId }).delete();
			}
			pending.clear();
		};
	}, []);

	const deleteMutation = useMutation({
		mutationFn: async (bookmarkId: string) => {
			const { error } = await api.api.bookmarks({ id: bookmarkId }).delete();
			if (error) throw new Error("Failed to delete bookmark");
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["library"] });
		},
		onError: () => {
			toast.error("Failed to remove bookmark");
		},
	});

	function handleDelete(bookmarkId: string) {
		// Snapshot current data for undo
		const previous = queryClient.getQueryData(queryKey);

		// Optimistically remove from cache
		queryClient.setQueryData(queryKey, (old: typeof data) => {
			if (!old) return old;
			return {
				...old,
				pages: old.pages.map((page) => {
					if (!page) return page;
					return {
						...page,
						items: (page.items as ReadLaterBookmark[]).filter(
							(item) => item.id !== bookmarkId
						),
					};
				}),
			};
		});

		// Schedule actual delete after 5s (allows undo)
		const timeout = setTimeout(() => {
			pendingDeletes.current.delete(bookmarkId);
			deleteMutation.mutate(bookmarkId);
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
					queryClient.setQueryData(queryKey, previous);
				},
			},
		});
	}

	const favoriteMutation = useMutation({
		mutationFn: async (bookmarkId: string) => {
			const { error } = await api.api
				.bookmarks({ id: bookmarkId })
				.favorite.post({});
			if (error) throw new Error("Failed to toggle favorite");
		},
		onMutate: async (bookmarkId: string) => {
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData(queryKey);

			queryClient.setQueryData(queryKey, (old: typeof data) => {
				if (!old) return old;
				return {
					...old,
					pages: old.pages.map((page) => {
						if (!page) return page;
						return {
							...page,
							items: (page.items as ReadLaterBookmark[]).map((item) => {
								if (item.id !== bookmarkId) return item;
								const hasFavorite = item.tags?.some(
									(t) => t.name === "favorites"
								);
								return {
									...item,
									tags: hasFavorite
										? item.tags?.filter((t) => t.name !== "favorites")
										: [
												...(item.tags ?? []),
												{
													id: "optimistic-fav",
													name: "favorites",
													color: "#fbbf24",
													isSystem: true,
												},
											],
								};
							}),
						};
					}),
				};
			});

			return { previous };
		},
		onError: (_err, _id, context) => {
			if (context?.previous) {
				queryClient.setQueryData(queryKey, context.previous);
			}
			toast.error("Failed to update favorite");
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey });
			queryClient.invalidateQueries({ queryKey: ["library"] });
		},
	});

	function handleToggleFavorite(bookmarkId: string) {
		favoriteMutation.mutate(bookmarkId);
	}

	const virtualizer = useVirtualizer({
		count: hasNextPage ? bookmarks.length + 1 : bookmarks.length,
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
			lastItem.index >= bookmarks.length - 1 &&
			hasNextPage &&
			!isFetchingNextPage
		) {
			fetchNextPage();
		}
	}, [
		virtualItems,
		bookmarks.length,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
	]);

	if (isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Loader />
			</div>
		);
	}

	if (error) {
		return (
			<p className="py-12 text-center text-sm text-muted-foreground">
				Failed to load bookmarks
			</p>
		);
	}

	if (bookmarks.length === 0) {
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
					const isLoaderRow = virtualRow.index >= bookmarks.length;
					const bookmark = bookmarks[virtualRow.index];

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
								hasNextPage && (
									<div className="flex justify-center py-4">
										<Loader />
									</div>
								)
							) : bookmark ? (
								<ReadLaterRow
									bookmark={bookmark}
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
