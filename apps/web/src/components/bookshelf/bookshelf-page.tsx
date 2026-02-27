import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import Loader from "@/components/loader";
import { TagFilterPills } from "@/components/profile/tag-filter-pills";
import { Input } from "@/components/ui/input";

import { BookshelfResults } from "./bookshelf-results";
import { type ContentType, ContentTypeFilter } from "./content-type-filter";

export function BookshelfPage() {
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [contentType, setContentType] = useState<ContentType>("all");
	const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	useEffect(() => {
		if (contentType !== "bookmarks" && contentType !== "all") {
			setSelectedTagId(null);
		}
	}, [contentType]);

	const user = useQuery(api.users.getMe);
	const tags = useQuery(api.bookmarks.listTags, user ? {} : "skip");

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && searchInput) {
				setSearchInput("");
				setDebouncedSearch("");
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [searchInput]);

	if (user === undefined) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
				<Loader />
			</div>
		);
	}

	if (!user) {
		return (
			<div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6">
				<p className="text-sm text-muted-foreground">
					Unable to load your library
				</p>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-4xl px-6 py-10">
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

			<ContentTypeFilter onChange={setContentType} value={contentType} />

			{(contentType === "bookmarks" || contentType === "all") && (
				<div className="mt-4">
					<TagFilterPills
						isLoading={tags === undefined}
						onSelectTag={setSelectedTagId}
						selectedTagId={selectedTagId}
						tags={tags ?? []}
					/>
				</div>
			)}

			<div className="mt-4">
				<BookshelfResults
					contentType={contentType}
					searchQuery={debouncedSearch}
					selectedTagId={selectedTagId}
					userId={user._id}
				/>
			</div>
		</div>
	);
}
