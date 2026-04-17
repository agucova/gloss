import { Link } from "@tanstack/react-router";

const basics = [
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

export function LandingFeatures() {
	return (
		<section className="flex w-full flex-col px-6 pt-24 pb-28 text-landing-ink sm:px-16">
			<div className="grid w-full grid-cols-1 gap-x-12 gap-y-16 sm:grid-cols-2 lg:grid-cols-4">
				{basics.map((item) => (
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

				<div className="flex flex-col gap-4 border-t border-landing-rule pt-5 sm:col-span-2">
					<div className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className="h-1.5 w-1.5 bg-highlight-friend-a"
						/>
						<span className="text-[11px] font-medium tracking-[0.14em] text-landing-ink-subtle uppercase">
							Migrating
						</span>
					</div>
					<h3 className="max-w-[20ch] font-display text-[clamp(1.625rem,2.6vw,2rem)] leading-[1.15] tracking-[-0.012em] text-landing-ink">
						Leave Curius without leaving your friends.
					</h3>
					<p className="max-w-[52ch] text-[15px] leading-relaxed text-landing-ink-muted">
						Your archive imports in one step. Friends still on Curius keep
						showing up in your Gloss margin, so migrating doesn't mean ghosting
						them.
					</p>
					<Link
						to="/login"
						className="mt-1 self-start border-b border-landing-ink pb-[2px] text-[13px] font-medium tracking-[0.01em] text-landing-ink transition-opacity hover:opacity-70"
					>
						How the import works <span aria-hidden="true">→</span>
					</Link>
				</div>

				<div className="flex flex-col gap-4 border-t border-landing-rule pt-5 sm:col-span-2">
					<div className="flex items-center gap-2">
						<span aria-hidden="true" className="h-1.5 w-1.5 bg-landing-ink" />
						<span className="text-[11px] font-medium tracking-[0.14em] text-landing-ink-subtle uppercase">
							CLI · MCP
						</span>
					</div>
					<h3 className="max-w-[20ch] font-display text-[clamp(1.625rem,2.6vw,2rem)] leading-[1.15] tracking-[-0.012em] text-landing-ink">
						Open to your agents.
					</h3>
					<p className="max-w-[52ch] text-[15px] leading-relaxed text-landing-ink-muted">
						Your library is a first-class thing, not a black box. A CLI and an
						MCP server make it readable from the command line, or from Claude
						and anything else that speaks MCP.
					</p>
					<pre className="mt-1 flex max-w-[40ch] flex-col gap-1.5 bg-landing-ink px-4 py-3.5 font-mono text-[12px] tracking-[0.02em]">
						<code className="text-landing-ink-subtle">
							{"$ gloss search "}
							<span className="text-[#E8E2D6]">&quot;superweb&quot;</span>
						</code>
						<code className="text-[#E8E2D6]">
							3 highlights across 2 articles.
						</code>
					</pre>
				</div>
			</div>
		</section>
	);
}
