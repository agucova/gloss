import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/logo";

export function LandingTopBar() {
	return (
		<header className="flex w-full items-center justify-between px-6 pt-8 text-landing-ink sm:px-16">
			<Link
				to="/"
				aria-label="Gloss home"
				className="flex items-center gap-2.5"
			>
				<Logo variant="mark" className="h-6 w-6 text-landing-ink" />
				<span className="text-[17px] font-medium tracking-[-0.01em]">
					Gloss
				</span>
			</Link>
			<Link
				to="/login"
				className="text-sm text-landing-ink-muted transition-colors hover:text-landing-ink"
			>
				Log in
			</Link>
		</header>
	);
}
