import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	AlertTriangle,
	Bookmark,
	Highlighter,
	Library,
	Search,
	Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { BookmarkCard, HighlightCard } from "@/components/cards";
import Loader from "@/components/loader";
import { api } from "@/utils/api";

import type { ContentType } from "./content-type-filter";

interface BookshelfResultsProps {
	userId: string;
	searchQuery: string;
	contentType: ContentType;
	selectedTagId: string | null;
}

interface BookmarkItem {
	type: "bookmark";
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

interface HighlightItem {
	type: "highlight";
	id: string;
	text: string;
	url: string;
	createdAt: Date | string;
}

type MergedItem = BookmarkItem | HighlightItem;

export function BookshelfResults({
	userId,
	searchQuery,
	contentType,
	selectedTagId,
}: BookshelfResultsProps) {
	// When searching, use hybrid search API for better results (supports tag filtering)
	if (searchQuery) {
		return (
			<HybridSearchResults
				contentType={contentType}
				searchQuery={searchQuery}
				selectedTagId={selectedTagId}
			/>
		);
	}

	// No search query, but tag filter - use browse endpoint with tag filtering
	if (contentType === "bookmarks" && selectedTagId) {
		return (
			<BookmarksBrowseList
				searchQuery=""
				selectedTagId={selectedTagId}
				userId={userId}
			/>
		);
	}

	// No search query - browse mode using traditional endpoints
	if (contentType === "bookmarks") {
		return (
			<BookmarksBrowseList
				searchQuery=""
				selectedTagId={null}
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
 * Hybrid search results using the /search API with semantic + FTS.
 * Used when user enters a search query.
 * Supports optional tag filtering.
 */
function HybridSearchResults({
	searchQuery,
	contentType,
	selectedTagId,
}: {
	searchQuery: string;
	contentType: ContentType;
	selectedTagId: string | null;
}) {
	const parentRef = useRef<HTMLDivElement>(null);

	// Determine which types to search
	const searchTypesMap: Record<ContentType, string> = {
		all: "bookmark,highlight",
		bookmarks: "bookmark",
		highlights: "highlight",
	};
	const searchTypes = searchTypesMap[contentType];

	const {
		data,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading,
		error,
	} = useInfiniteQuery({
		queryKey: ["library", "search", searchQuery, searchTypes, selectedTagId],
		queryFn: async ({ pageParam = 0 }) => {
			const { data, error } = await api.api.search.get({
				query: {
					q: searchQuery,
					types: searchTypes,
					mode: "hybrid",
					limit: 20,
					offset: pageParam,
					...(selectedTagId ? { tagId: selectedTagId } : {}),
				},
			});
			if (error) {
				throw new Error("Failed to search");
			}
			return data;
		},
		initialPageParam: 0,
		getNextPageParam: (lastPage, _allPages, lastPageParam) => {
			// Check if we got results and might have more
			if (lastPage?.results && lastPage.results.length === 20) {
				return lastPageParam + 20;
			}
			return undefined;
		},
		enabled: searchQuery.length > 0,
	});

	// Check search metadata for indicator display
	const meta = data?.pages[0]?.meta;
	const semanticSearchUsed = meta?.semanticSearchUsed ?? false;
	const searchError = (meta as Record<string, unknown> | undefined)?.error as
		| string
		| undefined;

	const results = useMemo(() => {
		const allResults = data?.pages.flatMap((page) => page?.results ?? []) ?? [];
		// Filter to only bookmarks and highlights (exclude comments)
		return allResults
			.filter(
				(result) => result.type === "bookmark" || result.type === "highlight"
			)
			.map((result) => {
				if (result.type === "bookmark") {
					// Type assertion for bookmark with tags
					const bookmarkResult = result as {
						type: "bookmark";
						id: string;
						url: string;
						title: string | null;
						description: string | null;
						favicon: string | null;
						createdAt: Date;
						tags?: Array<{
							id: string;
							name: string;
							color: string | null;
							isSystem: boolean;
						}>;
					};
					return {
						type: "bookmark" as const,
						id: bookmarkResult.id,
						url: bookmarkResult.url,
						title: bookmarkResult.title,
						description: bookmarkResult.description,
						favicon: bookmarkResult.favicon,
						createdAt: bookmarkResult.createdAt,
						tags: bookmarkResult.tags,
					};
				}
				// Type narrowing: result.type === "highlight"
				const highlightResult = result as {
					type: "highlight";
					id: string;
					url: string;
					text: string;
					createdAt: Date;
				};
				return {
					type: "highlight" as const,
					id: highlightResult.id,
					url: highlightResult.url,
					text: highlightResult.text,
					createdAt: highlightResult.createdAt,
				};
			});
	}, [data]);

	const virtualizer = useVirtualizer({
		count: hasNextPage ? results.length + 1 : results.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 105,
		overscan: 5,
		measureElement: (element) => element.getBoundingClientRect().height,
	});

	const virtualItems = virtualizer.getVirtualItems();

	useEffect(() => {
		const lastItem = virtualItems.at(-1);
		if (!lastItem) {
			return;
		}

		if (
			lastItem.index >= results.length - 1 &&
			hasNextPage &&
			!isFetchingNextPage
		) {
			fetchNextPage();
		}
	}, [
		virtualItems,
		results.length,
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
				Failed to search
			</p>
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
			{/* Search mode indicator */}
			<div className="mb-3 flex items-center gap-3 text-xs">
				{semanticSearchUsed ? (
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<Sparkles className="h-3 w-3" />
						<span>Semantic search enabled</span>
					</div>
				) : (
					<div className="flex items-center gap-1.5 text-muted-foreground/60">
						<Search className="h-3 w-3" />
						<span>Text search only</span>
					</div>
				)}
				{searchError && (
					<div className="flex items-center gap-1.5 text-amber-500/80 dark:text-amber-400/70">
						<AlertTriangle className="h-3 w-3" />
						<span>Search limited: {searchError}</span>
					</div>
				)}
			</div>

			<div className="h-[calc(100vh-19rem)] overflow-auto" ref={parentRef}>
				<div
					className="relative w-full"
					style={{ height: `${virtualizer.getTotalSize()}px` }}
				>
					{virtualItems.map((virtualRow) => {
						const isLoaderRow = virtualRow.index >= results.length;
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
								{isLoaderRow ? (
									hasNextPage && (
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
		</div>
	);
}

/**
 * Browse mode for merged bookmarks + highlights (no search query).
 * Uses traditional endpoints, sorted by createdAt.
 */
function MergedBrowseList({ userId }: { userId: string }) {
	const parentRef = useRef<HTMLDivElement>(null);

	const bookmarksQuery = useInfiniteQuery({
		queryKey: ["library", "browse", "bookmarks", userId],
		queryFn: async ({ pageParam }) => {
			const { data, error } = await api.api.users({ userId }).bookmarks.get({
				query: {
					cursor: pageParam,
					limit: 20,
				},
			});
			if (error) {
				throw new Error("Failed to fetch bookmarks");
			}
			return data;
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
	});

	const highlightsQuery = useInfiniteQuery({
		queryKey: ["library", "browse", "highlights", userId],
		queryFn: async ({ pageParam }) => {
			const { data, error } = await api.api.users({ userId }).highlights.get({
				query: {
					cursor: pageParam,
					limit: 20,
				},
			});
			if (error) {
				throw new Error("Failed to fetch highlights");
			}
			return data;
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
	});

	const bookmarks =
		bookmarksQuery.data?.pages.flatMap((page) => page?.items ?? []) ?? [];
	const highlights =
		highlightsQuery.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

	const mergedItems = useMemo(() => {
		const bookmarkItems: MergedItem[] = bookmarks.map((b) => ({
			type: "bookmark" as const,
			...b,
		}));
		const highlightItems: MergedItem[] = highlights.map((h) => ({
			type: "highlight" as const,
			...h,
		}));

		return [...bookmarkItems, ...highlightItems].sort((a, b) => {
			const dateA = new Date(a.createdAt).getTime();
			const dateB = new Date(b.createdAt).getTime();
			return dateB - dateA;
		});
	}, [bookmarks, highlights]);

	const hasNextPage = bookmarksQuery.hasNextPage || highlightsQuery.hasNextPage;
	const isFetchingNextPage =
		bookmarksQuery.isFetchingNextPage || highlightsQuery.isFetchingNextPage;

	const virtualizer = useVirtualizer({
		count: hasNextPage ? mergedItems.length + 1 : mergedItems.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 105,
		overscan: 5,
		measureElement: (element) => element.getBoundingClientRect().height,
	});

	const virtualItems = virtualizer.getVirtualItems();

	useEffect(() => {
		const lastItem = virtualItems.at(-1);
		if (!lastItem) {
			return;
		}

		if (
			lastItem.index >= mergedItems.length - 1 &&
			hasNextPage &&
			!isFetchingNextPage
		) {
			if (bookmarksQuery.hasNextPage) {
				bookmarksQuery.fetchNextPage();
			}
			if (highlightsQuery.hasNextPage) {
				highlightsQuery.fetchNextPage();
			}
		}
	}, [
		virtualItems,
		mergedItems.length,
		hasNextPage,
		isFetchingNextPage,
		bookmarksQuery,
		highlightsQuery,
	]);

	const isLoading = bookmarksQuery.isLoading || highlightsQuery.isLoading;
	const error = bookmarksQuery.error || highlightsQuery.error;

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
				Failed to load items
			</p>
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
								hasNextPage && (
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
 * Browse/search bookmarks using traditional endpoint.
 * Used when tag filter is active (search API doesn't support tag filtering).
 */
function BookmarksBrowseList({
	userId,
	searchQuery,
	selectedTagId,
}: {
	userId: string;
	searchQuery: string;
	selectedTagId: string | null;
}) {
	const parentRef = useRef<HTMLDivElement>(null);

	const {
		data,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading,
		error,
	} = useInfiniteQuery({
		queryKey: [
			"library",
			"browse",
			"bookmarks",
			userId,
			searchQuery,
			selectedTagId,
		],
		queryFn: async ({ pageParam }) => {
			const { data, error } = await api.api.users({ userId }).bookmarks.get({
				query: {
					cursor: pageParam,
					limit: 20,
					...(searchQuery ? { q: searchQuery } : {}),
					...(selectedTagId ? { tagId: selectedTagId } : {}),
				},
			});
			if (error) {
				throw new Error("Failed to fetch bookmarks");
			}
			return data;
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
	});

	const bookmarks = data?.pages.flatMap((page) => page?.items ?? []) ?? [];

	const virtualizer = useVirtualizer({
		count: hasNextPage ? bookmarks.length + 1 : bookmarks.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 110,
		overscan: 5,
		measureElement: (element) => element.getBoundingClientRect().height,
	});

	const virtualItems = virtualizer.getVirtualItems();

	useEffect(() => {
		const lastItem = virtualItems.at(-1);
		if (!lastItem) {
			return;
		}

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
								hasNextPage && (
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
 * Browse highlights using traditional endpoint.
 * Used when no search query.
 */
function HighlightsBrowseList({
	userId,
	searchQuery,
}: {
	userId: string;
	searchQuery: string;
}) {
	const parentRef = useRef<HTMLDivElement>(null);

	const {
		data,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading,
		error,
	} = useInfiniteQuery({
		queryKey: ["library", "browse", "highlights", userId, searchQuery],
		queryFn: async ({ pageParam }) => {
			const { data, error } = await api.api.users({ userId }).highlights.get({
				query: {
					cursor: pageParam,
					limit: 20,
					...(searchQuery ? { q: searchQuery } : {}),
				},
			});
			if (error) {
				throw new Error("Failed to fetch highlights");
			}
			return data;
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
	});

	const highlights = data?.pages.flatMap((page) => page?.items ?? []) ?? [];

	const virtualizer = useVirtualizer({
		count: hasNextPage ? highlights.length + 1 : highlights.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 100,
		overscan: 5,
		measureElement: (element) => element.getBoundingClientRect().height,
	});

	const virtualItems = virtualizer.getVirtualItems();

	useEffect(() => {
		const lastItem = virtualItems.at(-1);
		if (!lastItem) {
			return;
		}

		if (
			lastItem.index >= highlights.length - 1 &&
			hasNextPage &&
			!isFetchingNextPage
		) {
			fetchNextPage();
		}
	}, [
		virtualItems,
		highlights.length,
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
				Failed to load highlights
			</p>
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
								hasNextPage && (
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
