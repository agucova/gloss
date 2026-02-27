import type { Id } from "@convex/_generated/dataModel";

import { api } from "@convex/_generated/api";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Bookmark, Highlighter, Library, Search } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { BookmarkCard, HighlightCard } from "@/components/cards";
import Loader from "@/components/loader";

import type { ContentType } from "./content-type-filter";

interface BookshelfResultsProps {
	userId: Id<"users">;
	searchQuery: string;
	contentType: ContentType;
	selectedTagId: string | null;
}

export function BookshelfResults({
	userId,
	searchQuery,
	contentType,
	selectedTagId,
}: BookshelfResultsProps) {
	if (searchQuery) {
		return (
			<FTSSearchResults
				contentType={contentType}
				searchQuery={searchQuery}
				selectedTagId={selectedTagId}
			/>
		);
	}

	if (contentType === "bookmarks") {
		return (
			<BookmarksBrowseList
				searchQuery=""
				selectedTagId={selectedTagId}
				userId={userId}
			/>
		);
	}

	if (contentType === "highlights") {
		return <HighlightsBrowseList searchQuery="" userId={userId} />;
	}

	return <MergedBrowseList userId={userId} />;
}

/**
 * FTS search results using Convex search query.
 */
function FTSSearchResults({
	searchQuery,
	contentType,
	selectedTagId,
}: {
	searchQuery: string;
	contentType: ContentType;
	selectedTagId: string | null;
}) {
	const parentRef = useRef<HTMLDivElement>(null);

	const typesMap: Record<ContentType, string[]> = {
		all: ["bookmark", "highlight"],
		bookmarks: ["bookmark"],
		highlights: ["highlight"],
	};

	const searchResults = useQuery(
		api.search.search,
		searchQuery.length > 0
			? {
					q: searchQuery,
					types: typesMap[contentType],
					limit: 50,
					...(selectedTagId ? { tagId: selectedTagId as Id<"tags"> } : {}),
				}
			: "skip"
	);

	const results = useMemo(() => {
		if (!searchResults?.results) return [];
		return searchResults.results
			.filter(
				(r) => r.entityType === "bookmark" || r.entityType === "highlight"
			)
			.map((r) => {
				if (r.entityType === "bookmark" && r.bookmark) {
					const b = r.bookmark as Record<string, unknown>;
					return {
						type: "bookmark" as const,
						_id: r.entityId,
						url: r.url ?? "",
						title: (b.title as string) ?? null,
						description: (b.description as string) ?? null,
						favicon: (b.favicon as string) ?? null,
						_creationTime: r.createdAt,
						tags:
							(b.tags as Array<{
								_id: string;
								name: string;
								color: string | null;
								isSystem: boolean;
							}>) ?? [],
					};
				}
				return {
					type: "highlight" as const,
					_id: r.entityId,
					url: r.url ?? "",
					text: r.content,
					_creationTime: r.createdAt,
				};
			});
	}, [searchResults]);

	const virtualizer = useVirtualizer({
		count: results.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 105,
		overscan: 5,
		measureElement: (element) => element.getBoundingClientRect().height,
	});

	const virtualItems = virtualizer.getVirtualItems();

	if (searchResults === undefined) {
		return (
			<div className="flex justify-center py-12">
				<Loader />
			</div>
		);
	}

	if (results.length === 0) {
		return (
			<div className="py-12 text-center">
				<Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
				<p className="text-sm text-muted-foreground">
					No results matching "{searchQuery}"
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			<div className="mb-3 flex items-center gap-3 text-xs">
				<div className="flex items-center gap-1.5 text-muted-foreground/60">
					<Search className="h-3 w-3" />
					<span>Text search</span>
				</div>
			</div>

			<div className="h-[calc(100vh-19rem)] overflow-auto" ref={parentRef}>
				<div
					className="relative w-full"
					style={{ height: `${virtualizer.getTotalSize()}px` }}
				>
					{virtualItems.map((virtualRow) => {
						const item = results[virtualRow.index];

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
								{item ? (
									<div className="pb-2">
										{item.type === "bookmark" ? (
											<BookmarkCard bookmark={item} />
										) : (
											<HighlightCard highlight={item} />
										)}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/**
 * Browse merged bookmarks + highlights sorted by creation time.
 */
function MergedBrowseList({ userId }: { userId: Id<"users"> }) {
	const parentRef = useRef<HTMLDivElement>(null);

	const bookmarksQuery = usePaginatedQuery(
		api.users.getUserBookmarks,
		{ userId, paginationOpts: { numItems: 20 } },
		{ initialNumItems: 20 }
	);

	const highlightsQuery = usePaginatedQuery(
		api.users.getUserHighlights,
		{ userId, paginationOpts: { numItems: 20 } },
		{ initialNumItems: 20 }
	);

	const mergedItems = useMemo(() => {
		const bookmarkItems = (bookmarksQuery.results ?? []).map((b) => ({
			type: "bookmark" as const,
			_id: b._id,
			url: b.url,
			title: b.title ?? null,
			description: b.description ?? null,
			favicon: b.favicon ?? null,
			_creationTime: b._creationTime,
		}));
		const highlightItems = (highlightsQuery.results ?? []).map((h) => ({
			type: "highlight" as const,
			_id: h._id,
			url: h.url,
			text: h.text,
			_creationTime: h._creationTime,
		}));

		return [...bookmarkItems, ...highlightItems].sort(
			(a, b) => b._creationTime - a._creationTime
		);
	}, [bookmarksQuery.results, highlightsQuery.results]);

	const canLoadMore =
		bookmarksQuery.status === "CanLoadMore" ||
		highlightsQuery.status === "CanLoadMore";
	const isLoadingMore =
		bookmarksQuery.status === "LoadingMore" ||
		highlightsQuery.status === "LoadingMore";

	const virtualizer = useVirtualizer({
		count: canLoadMore ? mergedItems.length + 1 : mergedItems.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 105,
		overscan: 5,
		measureElement: (element) => element.getBoundingClientRect().height,
	});

	const virtualItems = virtualizer.getVirtualItems();

	useEffect(() => {
		const lastItem = virtualItems.at(-1);
		if (!lastItem) return;

		if (
			lastItem.index >= mergedItems.length - 1 &&
			canLoadMore &&
			!isLoadingMore
		) {
			if (bookmarksQuery.status === "CanLoadMore") {
				bookmarksQuery.loadMore(20);
			}
			if (highlightsQuery.status === "CanLoadMore") {
				highlightsQuery.loadMore(20);
			}
		}
	}, [
		virtualItems,
		mergedItems.length,
		canLoadMore,
		isLoadingMore,
		bookmarksQuery,
		highlightsQuery,
	]);

	const isLoading =
		bookmarksQuery.status === "LoadingFirstPage" ||
		highlightsQuery.status === "LoadingFirstPage";

	if (isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Loader />
			</div>
		);
	}

	if (mergedItems.length === 0) {
		return (
			<div className="py-12 text-center">
				<Library className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
				<p className="mb-1 text-sm text-foreground">Your library is empty</p>
				<p className="text-xs text-muted-foreground">
					Start saving bookmarks and highlights to see them here
				</p>
			</div>
		);
	}

	return (
		<div className="h-[calc(100vh-18rem)] overflow-auto" ref={parentRef}>
			<div
				className="relative w-full"
				style={{ height: `${virtualizer.getTotalSize()}px` }}
			>
				{virtualItems.map((virtualRow) => {
					const isLoaderRow = virtualRow.index >= mergedItems.length;
					const item = mergedItems[virtualRow.index];

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
							) : item ? (
								<div className="pb-2">
									{item.type === "bookmark" ? (
										<BookmarkCard bookmark={item} />
									) : (
										<HighlightCard highlight={item} />
									)}
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}

/**
 * Browse bookmarks with optional tag filtering and search.
 */
function BookmarksBrowseList({
	userId,
	searchQuery,
	selectedTagId,
}: {
	userId: Id<"users">;
	searchQuery: string;
	selectedTagId: string | null;
}) {
	const parentRef = useRef<HTMLDivElement>(null);

	const bookmarksQuery = usePaginatedQuery(
		api.bookmarks.list,
		{
			paginationOpts: { numItems: 20 },
			...(selectedTagId ? { tagId: selectedTagId as Id<"tags"> } : {}),
			...(searchQuery ? { search: searchQuery } : {}),
		},
		{ initialNumItems: 20 }
	);

	const bookmarks = bookmarksQuery.results ?? [];
	const canLoadMore = bookmarksQuery.status === "CanLoadMore";
	const isLoadingMore = bookmarksQuery.status === "LoadingMore";

	const virtualizer = useVirtualizer({
		count: canLoadMore ? bookmarks.length + 1 : bookmarks.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 110,
		overscan: 5,
		measureElement: (element) => element.getBoundingClientRect().height,
	});

	const virtualItems = virtualizer.getVirtualItems();

	useEffect(() => {
		const lastItem = virtualItems.at(-1);
		if (!lastItem) return;

		if (
			lastItem.index >= bookmarks.length - 1 &&
			canLoadMore &&
			!isLoadingMore
		) {
			bookmarksQuery.loadMore(20);
		}
	}, [
		virtualItems,
		bookmarks.length,
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

	if (bookmarks.length === 0) {
		if (searchQuery) {
			return (
				<div className="py-12 text-center">
					<Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
					<p className="text-sm text-muted-foreground">
						No bookmarks matching "{searchQuery}"
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
					Save pages with the browser extension
				</p>
			</div>
		);
	}

	return (
		<div className="h-[calc(100vh-18rem)] overflow-auto" ref={parentRef}>
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
								canLoadMore && (
									<div className="flex justify-center py-4">
										<Loader />
									</div>
								)
							) : bookmark ? (
								<div className="pb-2">
									<BookmarkCard bookmark={bookmark} />
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}

/**
 * Browse highlights with optional search.
 */
function HighlightsBrowseList({
	userId,
	searchQuery,
}: {
	userId: Id<"users">;
	searchQuery: string;
}) {
	const parentRef = useRef<HTMLDivElement>(null);

	const highlightsQuery = usePaginatedQuery(
		api.users.getUserHighlights,
		{
			userId,
			paginationOpts: { numItems: 20 },
			...(searchQuery ? { search: searchQuery } : {}),
		},
		{ initialNumItems: 20 }
	);

	const highlights = highlightsQuery.results ?? [];
	const canLoadMore = highlightsQuery.status === "CanLoadMore";
	const isLoadingMore = highlightsQuery.status === "LoadingMore";

	const virtualizer = useVirtualizer({
		count: canLoadMore ? highlights.length + 1 : highlights.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 100,
		overscan: 5,
		measureElement: (element) => element.getBoundingClientRect().height,
	});

	const virtualItems = virtualizer.getVirtualItems();

	useEffect(() => {
		const lastItem = virtualItems.at(-1);
		if (!lastItem) return;

		if (
			lastItem.index >= highlights.length - 1 &&
			canLoadMore &&
			!isLoadingMore
		) {
			highlightsQuery.loadMore(20);
		}
	}, [
		virtualItems,
		highlights.length,
		canLoadMore,
		isLoadingMore,
		highlightsQuery,
	]);

	if (highlightsQuery.status === "LoadingFirstPage") {
		return (
			<div className="flex justify-center py-12">
				<Loader />
			</div>
		);
	}

	if (highlights.length === 0) {
		if (searchQuery) {
			return (
				<div className="py-12 text-center">
					<Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
					<p className="text-sm text-muted-foreground">
						No highlights matching "{searchQuery}"
					</p>
				</div>
			);
		}
		return (
			<div className="py-12 text-center">
				<Highlighter className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
				<p className="mb-1 text-sm text-foreground">No highlights yet</p>
				<p className="text-xs text-muted-foreground">
					Highlight text on any page with the browser extension
				</p>
			</div>
		);
	}

	return (
		<div className="h-[calc(100vh-18rem)] overflow-auto" ref={parentRef}>
			<div
				className="relative w-full"
				style={{ height: `${virtualizer.getTotalSize()}px` }}
			>
				{virtualItems.map((virtualRow) => {
					const isLoaderRow = virtualRow.index >= highlights.length;
					const highlight = highlights[virtualRow.index];

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
							) : highlight ? (
								<div className="pb-2">
									<HighlightCard highlight={highlight} />
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}
