import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import Loader from "@/components/loader";
import { TagFilterPills } from "@/components/profile/tag-filter-pills";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

import { BookshelfResults } from "./bookshelf-results";
import { type ContentType, ContentTypeFilter } from "./content-type-filter";

export function BookshelfPage() {
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [contentType, setContentType] = useState<ContentType>("all");
	const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

	// 300ms debounce
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	// Clear tag filter when switching away from bookmarks
	useEffect(() => {
		if (contentType !== "bookmarks" && contentType !== "all") {
			setSelectedTagId(null);
		}
	}, [contentType]);

	// Fetch current user info
	const { data: user, isLoading: userLoading } = useQuery({
		queryKey: ["users", "me"],
		queryFn: async () => {
			const { data, error } = await api.api.users.me.get();
			if (error || !data || "error" in data) {
				throw new Error("Failed to fetch user");
			}
			return data;
		},
	});

	// Fetch user's tags for filtering
	const { data: tagsData, isLoading: tagsLoading } = useQuery({
		queryKey: ["library", "tags", user?.id],
		queryFn: async () => {
			if (!user?.id) {
				return { tags: [] };
			}
			const { data, error } = await api.api
				.users({ userId: user.id })
				.tags.get();
			if (error) {
				throw new Error("Failed to fetch tags");
			}
			return data;
		},
		enabled:
			!!user?.id && (contentType === "bookmarks" || contentType === "all"),
	});

	// Handle keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Escape to clear search
			if (e.key === "Escape" && searchInput) {
				setSearchInput("");
				setDebouncedSearch("");
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [searchInput]);

	if (userLoading) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
				<Loader />
			</div>
		);
	}

	if (!user) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6">
				<p className="text-muted-foreground text-sm">
					Unable to load your library
				</p>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-4xl px-6 py-10">
			{/* Search bar */}
			<div className="relative mb-6">
				<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="h-10 rounded-md border-border/60 bg-muted/30 pr-9 pl-9 focus-visible:bg-background"
					onChange={(e) => setSearchInput(e.target.value)}
					placeholder="Search your library..."
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

			{/* Content type filter */}
			<ContentTypeFilter onChange={setContentType} value={contentType} />

			{/* Tag filter pills (only for bookmarks or all) */}
			{(contentType === "bookmarks" || contentType === "all") && (
				<div className="mt-4">
					<TagFilterPills
						isLoading={tagsLoading}
						onSelectTag={setSelectedTagId}
						selectedTagId={selectedTagId}
						tags={tagsData?.tags ?? []}
					/>
				</div>
			)}

			{/* Results */}
			<div className="mt-4">
				<BookshelfResults
					contentType={contentType}
					searchQuery={debouncedSearch}
					selectedTagId={selectedTagId}
					userId={user.id}
				/>
			</div>
		</div>
	);
}
