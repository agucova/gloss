const items = [
	{
		n: "01",
		dot: "bg-highlight-own",
		heading: "Highlight anything.",
		body: "Select text on any page. Gloss saves the highlight the moment you let go.",
	},
	{
		n: "02",
		dot: "bg-highlight-friend-a",
		heading: "Annotate.",
		body: "Leave a note on a specific highlight. Reply where a friend marked it.",
	},
	{
		n: "03",
		dot: "bg-highlight-friend-b",
		heading: "See your friends.",
		body: "Your friends' highlights show up in the margin of pages you both read.",
	},
	{
		n: "04",
		dot: "bg-highlight-friend-c",
		heading: "Keep up with friends.",
		body: "A slow feed of what your friends have been marking lately.",
	},
] as const;

export function LandingBasics() {
	return (
		<section className="flex w-full flex-col gap-14 px-6 pt-20 text-landing-ink sm:px-16">
			<div className="flex items-center gap-2.5">
				<span aria-hidden="true" className="h-1.5 w-1.5 bg-landing-ink" />
				<span className="text-[11px] font-medium tracking-[0.14em] text-landing-ink-muted uppercase">
					What it does
				</span>
			</div>
			<div className="grid w-full grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
				{items.map((item) => (
					<div
						key={item.n}
						className="flex flex-col gap-3.5 border-t border-landing-rule pt-5"
					>
						<div className="flex items-center gap-2">
							<span aria-hidden="true" className={`h-1.5 w-1.5 ${item.dot}`} />
							<span className="text-[11px] font-medium tracking-[0.1em] text-landing-ink-subtle uppercase">
								{item.n}
							</span>
						</div>
						<h3 className="font-display text-[22px] leading-snug text-landing-ink">
							{item.heading}
						</h3>
						<p className="text-[14px] leading-relaxed text-landing-ink-muted">
							{item.body}
						</p>
					</div>
				))}
			</div>
		</section>
	);
}
