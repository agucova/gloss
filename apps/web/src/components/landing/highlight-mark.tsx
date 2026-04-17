import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type HighlightColor = "own" | "peach" | "pink" | "sage";

const colorMap: Record<HighlightColor, string> = {
	own: "bg-highlight-own",
	peach: "bg-highlight-friend-a",
	pink: "bg-highlight-friend-b",
	sage: "bg-highlight-friend-c",
};

interface HighlightMarkProps {
	color?: HighlightColor;
	children: ReactNode;
	className?: string;
	/** If true, the swatch animates in with a left-to-right bloom on mount. */
	bloom?: boolean;
}

/**
 * A padded span with a pastel background — the brand's one visual gesture.
 * Uses box-decoration-break so multi-line highlights render like marker strokes.
 */
export function HighlightMark({
	color = "own",
	children,
	className,
	bloom = false,
}: HighlightMarkProps) {
	return (
		<span
			className={cn(
				"relative inline-block [box-decoration-break:clone] px-[0.28em] pb-[0.04em] [-webkit-box-decoration-break:clone]",
				colorMap[color],
				bloom &&
					"landing-bloom origin-left [animation:landing-highlight-bloom_0.55s_cubic-bezier(0.22,1,0.36,1)_0.35s_both]",
				className
			)}
		>
			{children}
		</span>
	);
}
