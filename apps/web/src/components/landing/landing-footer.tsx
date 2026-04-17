import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/logo";

export function LandingFooter() {
	return (
		<footer className="mt-20 flex w-full flex-col gap-6 border-t border-landing-rule px-6 pt-20 pb-12 text-landing-ink sm:flex-row sm:items-center sm:justify-between sm:gap-12 sm:px-16">
			<div className="flex items-center gap-3.5">
				<Logo variant="mark" className="h-5 w-5 text-landing-ink" />
				<span className="text-sm font-medium text-landing-ink">Gloss</span>
			</div>
			<nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] text-landing-ink-muted sm:gap-x-8">
				<Link to="/login" className="hover:text-landing-ink">
					Log in
				</Link>
				<Link to="/privacy" className="hover:text-landing-ink">
					Privacy
				</Link>
				<Link to="/terms" className="hover:text-landing-ink">
					Terms
				</Link>
				<a
					href="https://github.com/agucova/gloss"
					target="_blank"
					rel="noopener noreferrer"
					className="hover:text-landing-ink"
				>
					GitHub
				</a>
				<a href="mailto:hello@gloss.space" className="hover:text-landing-ink">
					Contact
				</a>
			</nav>
		</footer>
	);
}
