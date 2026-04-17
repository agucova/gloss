/** @jsxImportSource react */
import { useState } from "react";

import { ReadLater } from "./read-later";
import { RecentHighlights } from "./recent-highlights";
import { RecentLinks } from "./recent-links";
import { SearchBar } from "./search-bar";
import { SearchResults } from "./search-results";

/**
 * Main dashboard component with search, friend activity, and bookmarks.
 * Follows a minimal, spacious, gallery-style layout.
 *
 * Data comes from Convex via `useQuery` inside each subsection — the host only
 * needs to provide a `ConvexProvider` / `ConvexBetterAuthProvider` ancestor.
 */
export function Dashboard() {
	const [searchQuery, setSearchQuery] = useState("");
	const isSearching = searchQuery.length > 0;

	return (
		<div className="mx-auto w-full max-w-4xl px-6 py-10">
			<SearchBar onChange={setSearchQuery} value={searchQuery} />

			{isSearching ? (
				<SearchResults query={searchQuery} />
			) : (
				<div className="mt-12 space-y-12">
					<div className="grid grid-cols-1 gap-10 md:grid-cols-2">
						<RecentHighlights />
						<RecentLinks />
					</div>

					<ReadLater />
				</div>
			)}
		</div>
	);
}
