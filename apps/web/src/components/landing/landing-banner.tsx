import { Link } from "@tanstack/react-router";

export function LandingBanner() {
	return (
		<Link
			to="/login"
			className="flex w-full items-center gap-3.5 border-b border-landing-rule px-6 py-3.5 text-landing-ink transition-colors hover:bg-landing-surface-2 sm:gap-4 sm:px-16"
		>
			<span
				aria-hidden="true"
				className="h-1.5 w-1.5 shrink-0 bg-highlight-friend-a"
			/>
			<span className="font-display text-[15px] leading-tight text-landing-ink">
				Coming from Curius?
			</span>
			<span className="hidden text-sm text-landing-ink-muted sm:inline">
				Bring your highlights with you.
			</span>
			<span className="ml-auto text-sm font-medium tracking-[0.01em] whitespace-nowrap text-landing-ink">
				Import <span aria-hidden="true">→</span>
			</span>
		</Link>
	);
}
