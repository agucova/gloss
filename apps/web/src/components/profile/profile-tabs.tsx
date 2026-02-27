import type { Id } from "@convex/_generated/dataModel";

import { api } from "@convex/_generated/api";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Bookmark, Highlighter, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BookmarkCard, HighlightCard } from "@/components/cards";
import Loader from "@/components/loader";
import { TagFilterPills } from "@/components/profile/tag-filter-pills";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ProfileTabsProps {
	profile: {
		_id: Id<"users">;
		name: string;
		bookmarksVisibility?: string | null;
		isFriend: boolean;
		isOwnProfile: boolean;
	};
	isOwnProfile: boolean;
}

type Tab = "highlights" | "bookmarks";

export function ProfileTabs({ profile, isOwnProfile }: ProfileTabsProps) {
	const [activeTab, setActiveTab] = useState<Tab>("highlights");
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	const handleTabChange = (tab: Tab) => {
		setActiveTab(tab);
		setSearchInput("");
		setDebouncedSearch("");
		setSelectedTagId(null);
	};

	const canViewBookmarks =
		isOwnProfile ||
		profile.bookmarksVisibility === "public" ||
		(profile.bookmarksVisibility === "friends" && profile.isFriend);

	const tags = useQuery(
		api.users.getUserTags,
		canViewBookmarks && activeTab === "bookmarks"
			? { userId: profile._id }
			: "skip"
	);

	return (
		<div className="flex min-h-[calc(100vh-12rem)] flex-col">
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

			{activeTab === "bookmarks" && canViewBookmarks && (
				<TagFilterPills
					isLoading={tags === undefined}
					onSelectTag={setSelectedTagId}
					selectedTagId={selectedTagId}
					tags={tags ?? []}
				/>
			)}

			<div className="flex-1">
				{activeTab === "highlights" && (
					<HighlightsList searchQuery={debouncedSearch} userId={profile._id} />
				)}
				{activeTab === "bookmarks" && canViewBookmarks && (
					<BookmarksList
						searchQuery={debouncedSearch}
						selectedTagId={selectedTagId}
						userId={profile._id}
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

function BookmarksList({
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
		api.users.getUserBookmarks,
		{
			userId,
			paginationOpts: { numItems: 20 },
			...(searchQuery ? { search: searchQuery } : {}),
			...(selectedTagId ? { tagId: selectedTagId as Id<"tags"> } : {}),
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
