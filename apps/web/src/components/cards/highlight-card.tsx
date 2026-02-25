import { formatRelativeTime, getDomain } from "./utils";

export interface HighlightCardProps {
	highlight: {
		id: string;
		text: string;
		url: string;
		createdAt: Date | string;
	};
}

export function HighlightCard({ highlight }: HighlightCardProps) {
	const domain = getDomain(highlight.url);

	return (
		<a
			className="group block rounded-md px-4 py-3 transition-colors hover:bg-muted/50"
			href={highlight.url}
			rel="noopener noreferrer"
			target="_blank"
		>
			<div className="flex gap-3">
				<div className="w-0.5 shrink-0 rounded-full bg-amber-400/70 dark:bg-amber-500/50" />
				<div className="min-w-0 flex-1">
					<p className="text-sm leading-relaxed text-foreground/90">
						{highlight.text}
					</p>
					<div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground/60">
						<span className="truncate">{domain}</span>
						<span>·</span>
						<span>{formatRelativeTime(highlight.createdAt)}</span>
					</div>
				</div>
			</div>
		</a>
	);
}
