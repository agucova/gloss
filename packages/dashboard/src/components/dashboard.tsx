import { useState } from "react";

import type { DashboardApiClient } from "../types";

import { ReadLater } from "./read-later";
import { RecentHighlights } from "./recent-highlights";
import { RecentLinks } from "./recent-links";
import { SearchBar } from "./search-bar";
import { SearchResults } from "./search-results";

interface DashboardProps {
	apiClient: DashboardApiClient;
}

/**
 * Main dashboard component with search, friend activity, and bookmarks.
 * Follows a minimal, spacious, gallery-style layout.
 */
export function Dashboard({ apiClient }: DashboardProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const isSearching = searchQuery.length > 0;

	return (
		<div className="mx-auto w-full max-w-4xl px-6 py-10">
			<SearchBar onChange={setSearchQuery} value={searchQuery} />

			{isSearching ? (
				<SearchResults apiClient={apiClient} query={searchQuery} />
			) : (
				<div className="mt-12 space-y-12">
					<div className="grid grid-cols-1 gap-10 md:grid-cols-2">
						<RecentLinks apiClient={apiClient} />
						<RecentHighlights apiClient={apiClient} />
					</div>

					<ReadLater apiClient={apiClient} />
				</div>
			)}
		</div>
	);
}
