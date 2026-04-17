/** @jsxImportSource react */
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

function getDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(WWW_REGEX, "");
	} catch {
		return url;
	}
}

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

function LinkItem({ item }: { item: FeedBookmark }) {
	const domain = getDomain(item.url);
	const userName = item.user?.name ?? "Unknown";

	return (
		<a
			className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
			href={item.url}
			rel="noopener noreferrer"
			target="_blank"
		>
			<UserDot className="mt-1 shrink-0" userId={item.user?._id ?? ""} />
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-3">
					<span className="text-sm font-medium text-foreground">
						{userName}
					</span>
					<span className="shrink-0 text-xs text-muted-foreground/60">
						{formatRelativeTime(item._creationTime)}
					</span>
				</div>
				<p className="mt-0.5 truncate text-sm text-muted-foreground transition-colors group-hover:text-foreground/70">
					in {item.title || domain}
				</p>
			</div>
		</a>
	);
}

function HighlightItem({ item }: { item: FeedHighlight }) {
	const domain = getDomain(item.url);
	const userName = item.user?.name ?? "Unknown";

	return (
		<a
			className="block rounded-lg border border-amber-200/40 bg-amber-50/50 p-3 transition-colors hover:bg-amber-100/50 dark:border-amber-800/30 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
			href={item.url}
			rel="noopener noreferrer"
			target="_blank"
		>
			<div className="mb-1.5 flex items-center justify-between gap-3">
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
					<span>{formatRelativeTime(item._creationTime)}</span>
					<span>·</span>
					<span className="truncate">{truncate(domain, 24)}</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs font-medium text-foreground/80">
						{userName}
					</span>
					<UserDot userId={item.user?._id ?? ""} />
				</div>
			</div>
			<p className="text-sm leading-relaxed break-words text-foreground/90">
				{truncate(item.text, 180)}
			</p>
		</a>
	);
}
