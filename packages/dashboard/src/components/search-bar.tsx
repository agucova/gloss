/** @jsxImportSource react */
import { Search } from "lucide-react";

import { cn } from "../utils/cn";

interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
}

/**
 * Search input for bookmarks and highlights.
 * Uses flex layout with icon and input as siblings for reliable alignment.
 */
export function SearchBar({
	value,
	onChange,
	placeholder = "Search your bookmarks",
	className,
}: SearchBarProps) {
	return (
		<label
			className={cn(
				"flex h-11 items-center gap-3 rounded-lg",
				"border border-border bg-muted/30 px-4",
				"transition-colors duration-150",
				"hover:bg-muted/50",
				"focus-within:border-foreground/20 focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/10",
				className
			)}
		>
			<Search className="size-4 shrink-0 text-muted-foreground/60" />
			<input
				className="h-full flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				type="search"
				value={value}
			/>
		</label>
	);
}
