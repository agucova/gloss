import { useQuery } from "@tanstack/react-query";
import { ArrowDownAZ, ArrowUpAZ, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import Loader from "@/components/loader";
import { TagFilterPills } from "@/components/profile/tag-filter-pills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

import { ReadLaterList } from "./read-later-list";

export function ReadLaterPage() {
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

	// 300ms debounce
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	// Escape to clear search
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

	// Fetch current user
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

	// Fetch user's tags
	const { data: tagsData, isLoading: tagsLoading } = useQuery({
		queryKey: ["read-later", "tags", user?.id],
		queryFn: async () => {
			if (!user?.id) return { tags: [] };
			const { data, error } = await api.api
				.users({ userId: user.id })
				.tags.get();
			if (error) throw new Error("Failed to fetch tags");
			return data;
		},
		enabled: !!user?.id,
	});

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
				<p className="text-sm text-muted-foreground">
					Unable to load your bookmarks
				</p>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-4xl px-6 py-10">
			{/* Header */}
			<h1 className="mb-6 text-lg font-medium text-foreground">Read Later</h1>

			{/* Search bar */}
			<div className="relative mb-4">
				<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="h-10 rounded-md border-border/60 bg-muted/30 pr-9 pl-9 focus-visible:bg-background"
					onChange={(e) => setSearchInput(e.target.value)}
					placeholder="Search bookmarks..."
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

			{/* Tag pills + sort toggle */}
			<div className="mb-4 flex items-center justify-between gap-4">
				<div className="min-w-0 flex-1">
					<TagFilterPills
						isLoading={tagsLoading}
						onSelectTag={setSelectedTagId}
						selectedTagId={selectedTagId}
						tags={tagsData?.tags ?? []}
					/>
				</div>
				<Button
					className="shrink-0 gap-1.5 text-muted-foreground"
					onClick={() =>
						setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
					}
					size="sm"
					variant="ghost"
				>
					{sortOrder === "desc" ? (
						<>
							<ArrowDownAZ className="h-3.5 w-3.5" />
							<span>Newest</span>
						</>
					) : (
						<>
							<ArrowUpAZ className="h-3.5 w-3.5" />
							<span>Oldest</span>
						</>
					)}
				</Button>
			</div>

			{/* Bookmark list */}
			<ReadLaterList
				searchQuery={debouncedSearch}
				selectedTagId={selectedTagId}
				sortOrder={sortOrder}
				userId={user.id}
			/>
		</div>
	);
}
