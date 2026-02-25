import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Bookmark, Highlighter, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BookmarkCard, HighlightCard } from "@/components/cards";
import Loader from "@/components/loader";
import { TagFilterPills } from "@/components/profile/tag-filter-pills";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

interface ProfileTabsProps {
	profile: {
		id: string;
		name: string;
		bookmarksVisibility?: "public" | "friends" | "private" | null;
		friendshipStatus?: "none" | "pending_sent" | "pending_received" | "friends";
	};
	isOwnProfile: boolean;
}

type Tab = "highlights" | "bookmarks";

export function ProfileTabs({ profile, isOwnProfile }: ProfileTabsProps) {
	const [activeTab, setActiveTab] = useState<Tab>("highlights");
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

	// 300ms debounce
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	// Clear search and tag filter on tab change
	const handleTabChange = (tab: Tab) => {
		setActiveTab(tab);
		setSearchInput("");
		setDebouncedSearch("");
		setSelectedTagId(null);
	};

	// Check if bookmarks should be visible
	const canViewBookmarks =
		isOwnProfile ||
		profile.bookmarksVisibility === "public" ||
		(profile.bookmarksVisibility === "friends" &&
			profile.friendshipStatus === "friends");

	// Fetch user's tags for filtering
	const { data: tagsData, isLoading: tagsLoading } = useQuery({
		queryKey: ["user", profile.id, "tags"],
		queryFn: async () => {
			const { data, error } = await api.api
				.users({ userId: profile.id })
				.tags.get();
			if (error) {
				throw new Error("Failed to fetch tags");
			}
			return data;
		},
		enabled: canViewBookmarks && activeTab === "bookmarks",
	});

	return (
		<div className="flex min-h-[calc(100vh-12rem)] flex-col">
			{/* Tab headers */}
			<div className="flex gap-1 border-b border-border">
				<TabButton
					active={activeTab === "highlights"}
					icon={<Highlighter className="h-4 w-4" />}
					label="Highlights"
					onClick={() => handleTabChange("highlights")}
				/>
				{canViewBookmarks && (
					<TabButton
						active={activeTab === "bookmarks"}
						icon={<Bookmark className="h-4 w-4" />}
						label="Bookmarks"
						onClick={() => handleTabChange("bookmarks")}
					/>
				)}
			</div>

			{/* Search input */}
			<div className="relative py-4">
				<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="h-9 rounded-md border-border/60 bg-muted/30 pr-9 pl-9 focus-visible:bg-background"
					onChange={(e) => setSearchInput(e.target.value)}
					placeholder={
						activeTab === "highlights"
							? "Search highlights..."
							: "Search bookmarks..."
					}
					value={searchInput}
				/>
				{searchInput && (
					<button
						className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
						onClick={() => {
							setSearchInput("");
							setDebouncedSearch("");
						}}
						type="button"
					>
						<X className="h-4 w-4" />
					</button>
				)}
			</div>

			{/* Tag filter pills (only for bookmarks) */}
			{activeTab === "bookmarks" && canViewBookmarks && (
				<TagFilterPills
					isLoading={tagsLoading}
					onSelectTag={setSelectedTagId}
					selectedTagId={selectedTagId}
					tags={tagsData?.tags ?? []}
				/>
			)}

			{/* Tab content */}
			<div className="flex-1">
				{activeTab === "highlights" && (
					<HighlightsList searchQuery={debouncedSearch} userId={profile.id} />
				)}
				{activeTab === "bookmarks" && canViewBookmarks && (
					<BookmarksList
						searchQuery={debouncedSearch}
						selectedTagId={selectedTagId}
						userId={profile.id}
					/>
				)}
			</div>
		</div>
	);
}

interface TabButtonProps {
	active: boolean;
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
}

function TabButton({ active, icon, label, onClick }: TabButtonProps) {
	return (
		<button
			className={cn(
				"flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:bg-muted/50",
				active
					? "border-foreground text-foreground"
					: "border-transparent text-muted-foreground hover:text-foreground"
			)}
			onClick={onClick}
			type="button"
		>
			{icon}
			{label}
		</button>
	);
}

function HighlightsList({
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
		queryKey: ["user", userId, "highlights", searchQuery],
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

	// Fetch next page when last item is visible
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
				<p className="text-sm text-muted-foreground">No highlights yet</p>
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

function BookmarksList({
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
		queryKey: ["user", userId, "bookmarks", searchQuery, selectedTagId],
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

	// Fetch next page when last item is visible
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
				<p className="text-sm text-muted-foreground">No bookmarks yet</p>
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
