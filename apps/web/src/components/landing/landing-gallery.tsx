import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

const dotColors = [
	"bg-highlight-own",
	"bg-highlight-friend-a",
	"bg-highlight-friend-b",
	"bg-highlight-friend-c",
];

export function LandingGallery() {
	const highlights = useQuery(api.highlights.listPublic, { limit: 12 });

	// Render nothing while loading, or when the feed is too thin to look intentional.
	if (!highlights || highlights.length < 3) return null;

	// Round-robin the rows across 3 columns so long excerpts don't all pile up in one.
	const columnIds = ["a", "b", "c"] as const;
	const columns = columnIds.map((id) => ({
		id,
		rows: [] as typeof highlights,
	}));
	highlights.forEach((h, i) => {
		const col = columns[i % columns.length];
		if (col) col.rows.push(h);
	});

	return (
		<section className="flex w-full flex-col gap-14 px-6 pt-28 pb-16 text-landing-ink sm:px-16">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="flex flex-col gap-4">
					<div className="flex items-center gap-2.5">
						<span aria-hidden="true" className="h-1.5 w-1.5 bg-landing-ink" />
						<span className="text-[11px] font-medium tracking-[0.14em] text-landing-ink-muted uppercase">
							Lately
						</span>
					</div>
					<h2 className="max-w-[20ch] font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.12] tracking-[-0.014em] text-landing-ink">
						A few things readers marked this week.
					</h2>
				</div>
				<span className="text-[13px] text-landing-ink-muted">
					A slice of what's in the public feed.
				</span>
			</div>
			<div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
				{columns.map((col, colIdx) => (
					<div key={col.id} className="flex flex-col gap-8">
						{col.rows.map((h, i) => (
							<article
								key={h._id}
								className="flex flex-col gap-3.5 border-b border-landing-rule pb-7"
							>
								<div className="flex items-center gap-2">
									<span
										aria-hidden="true"
										className={`h-2 w-2 rounded-full ${
											dotColors[(colIdx + i) % dotColors.length]
										}`}
									/>
									<span className="text-[12px] font-medium text-landing-ink-muted">
										{h.user?.name ?? "Anonymous"}
									</span>
								</div>
								<p className="font-display text-[15px] leading-[24px] text-landing-ink">
									"{h.text}"
								</p>
								<span className="text-[11px] text-landing-ink-subtle">
									{h.domain}
								</span>
							</article>
						))}
					</div>
				))}
			</div>
		</section>
	);
}
