import { Link } from "@tanstack/react-router";

export function LandingDistinctive() {
	return (
		<section className="flex w-full flex-col gap-14 px-6 pt-20 pb-28 text-landing-ink sm:px-16">
			<div className="flex items-center gap-2.5">
				<span aria-hidden="true" className="h-1.5 w-1.5 bg-landing-ink" />
				<span className="text-[11px] font-medium tracking-[0.14em] text-landing-ink-muted uppercase">
					What's different
				</span>
			</div>
			<div className="grid w-full grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-20">
				<div className="flex flex-col gap-5">
					<div className="flex items-center gap-2.5">
						<span
							aria-hidden="true"
							className="h-2 w-2 bg-highlight-friend-a"
						/>
						<span className="text-[11px] font-medium tracking-[0.14em] text-landing-ink-muted uppercase">
							Migrating
						</span>
					</div>
					<h3 className="max-w-[22ch] font-display text-[clamp(1.75rem,3vw,2.25rem)] leading-[1.15] tracking-[-0.012em] text-landing-ink">
						Leave Curius without leaving your friends.
					</h3>
					<p className="max-w-[52ch] text-[15px] leading-relaxed text-landing-ink-muted sm:text-base">
						Your archive imports in one step. Friends still on Curius keep
						showing up in your Gloss margin, so migrating doesn't mean ghosting
						them.
					</p>
					<Link
						to="/login"
						className="mt-2 self-start border-b border-landing-ink pb-[2px] text-[13px] font-medium tracking-[0.01em] text-landing-ink transition-opacity hover:opacity-70"
					>
						How the import works <span aria-hidden="true">→</span>
					</Link>
				</div>
				<div className="flex flex-col gap-5">
					<div className="flex items-center gap-2.5">
						<span aria-hidden="true" className="h-2 w-2 bg-landing-ink" />
						<span className="text-[11px] font-medium tracking-[0.14em] text-landing-ink-muted uppercase">
							CLI · MCP
						</span>
					</div>
					<h3 className="max-w-[22ch] font-display text-[clamp(1.75rem,3vw,2.25rem)] leading-[1.15] tracking-[-0.012em] text-landing-ink">
						Open to your agents.
					</h3>
					<p className="max-w-[52ch] text-[15px] leading-relaxed text-landing-ink-muted sm:text-base">
						Your library is a first-class thing, not a black box. A CLI and an
						MCP server make it readable from the command line, or from Claude
						and anything else that speaks MCP.
					</p>
					<pre className="mt-2 flex max-w-[40ch] flex-col gap-1.5 bg-landing-ink px-4 py-3.5 font-mono text-[12px] tracking-[0.02em]">
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
