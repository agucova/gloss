import { Link } from "@tanstack/react-router";

import { HighlightMark } from "./highlight-mark";

export function LandingHero() {
	return (
		<section className="flex w-full flex-col gap-10 px-6 pt-20 text-landing-ink sm:gap-12 sm:px-16 sm:pt-28">
			<h1 className="font-display text-[clamp(3rem,8.5vw,5.5rem)] leading-[1.06] tracking-[-0.02em] text-landing-ink">
				Read{" "}
				<HighlightMark color="peach" bloom>
					closely,
				</HighlightMark>{" "}
				together.
			</h1>
			<p className="max-w-[30ch] text-lg leading-relaxed text-landing-ink-muted sm:text-xl">
				Save what you highlight. See what your friends marked.
			</p>
			<div className="flex flex-wrap items-center gap-6">
				<Link
					to="/install"
					className="inline-flex items-center gap-2.5 bg-highlight-own px-5 py-3.5 text-[15px] font-medium text-landing-ink transition-opacity hover:opacity-90"
				>
					Get the extension <span aria-hidden="true">→</span>
				</Link>
				<Link
					to="/login"
					className="text-[15px] text-landing-ink-muted transition-colors hover:text-landing-ink"
				>
					or log in
				</Link>
			</div>
		</section>
	);
}
