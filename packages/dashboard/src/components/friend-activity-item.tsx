import type { FeedBookmark, FeedHighlight } from "../types";
import { formatRelativeTime } from "../utils/relative-time";
import { UserDot } from "./user-dot";

interface LinkActivityItemProps {
	type: "link";
	item: FeedBookmark;
}

interface HighlightActivityItemProps {
	type: "highlight";
	item: FeedHighlight;
}

type FriendActivityItemProps =
	| LinkActivityItemProps
	| HighlightActivityItemProps;

const WWW_REGEX = /^www\./;

/**
 * Extract domain from URL for display.
 */
function getDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(WWW_REGEX, "");
	} catch {
		return url;
	}
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	return `${text.slice(0, maxLength)}...`;
}

/**
 * A single activity item showing friend's bookmark or highlight.
 */
export function FriendActivityItem(props: FriendActivityItemProps) {
	if (props.type === "link") {
		return <LinkItem item={props.item} />;
	}
	return <HighlightItem item={props.item} />;
}

/**
 * Display a friend's bookmarked link.
 */
function LinkItem({ item }: { item: FeedBookmark }) {
	const domain = getDomain(item.url);

	return (
		<a
			className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
			href={item.url}
			rel="noopener noreferrer"
			target="_blank"
		>
			<UserDot className="mt-1 shrink-0" userId={item.user.id} />
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-3">
					<span className="font-medium text-foreground text-sm">
						{item.user.name}
					</span>
					<span className="shrink-0 text-muted-foreground/60 text-xs">
						{formatRelativeTime(item.createdAt)}
					</span>
				</div>
				<p className="mt-0.5 truncate text-muted-foreground text-sm transition-colors group-hover:text-foreground/70">
					in {item.title || domain}
				</p>
			</div>
		</a>
	);
}

/**
 * Display a friend's highlight.
 */
function HighlightItem({ item }: { item: FeedHighlight }) {
	const domain = getDomain(item.url);

	return (
		<a
			className="block rounded-lg border border-amber-200/40 bg-amber-50/50 p-3 transition-colors hover:bg-amber-100/50 dark:border-amber-800/30 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
			href={item.url}
			rel="noopener noreferrer"
			target="_blank"
		>
			<div className="mb-1.5 flex items-center justify-between gap-3">
				<div className="flex items-center gap-1.5 text-muted-foreground/70 text-xs">
					<span>{formatRelativeTime(item.createdAt)}</span>
					<span>·</span>
					<span className="truncate">{truncate(domain, 24)}</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="font-medium text-foreground/80 text-xs">
						{item.user.name}
					</span>
					<UserDot userId={item.user.id} />
				</div>
			</div>
			<p className="break-words text-foreground/90 text-sm leading-relaxed">
				{truncate(item.text, 180)}
			</p>
		</a>
	);
}
