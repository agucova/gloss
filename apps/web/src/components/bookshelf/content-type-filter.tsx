import { cn } from "@/lib/utils";

export type ContentType = "all" | "bookmarks" | "highlights";

interface ContentTypeFilterProps {
	value: ContentType;
	onChange: (value: ContentType) => void;
}

export function ContentTypeFilter({ value, onChange }: ContentTypeFilterProps) {
	return (
		<div className="flex gap-1 border-b border-border">
			<FilterButton
				active={value === "all"}
				label="All"
				onClick={() => onChange("all")}
			/>
			<FilterButton
				active={value === "bookmarks"}
				label="Bookmarks"
				onClick={() => onChange("bookmarks")}
			/>
			<FilterButton
				active={value === "highlights"}
				label="Highlights"
				onClick={() => onChange("highlights")}
			/>
		</div>
	);
}

interface FilterButtonProps {
	active: boolean;
	label: string;
	onClick: () => void;
}

function FilterButton({ active, label, onClick }: FilterButtonProps) {
	return (
		<button
			className={cn(
				"border-b-2 px-4 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:bg-muted/50",
				active
					? "border-foreground text-foreground"
					: "border-transparent text-muted-foreground hover:text-foreground"
			)}
			onClick={onClick}
			type="button"
		>
			{label}
		</button>
	);
}
