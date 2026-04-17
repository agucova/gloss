import { createFileRoute, Link } from "@tanstack/react-router";

import { Logo } from "@/components/logo";

export const Route = createFileRoute("/install")({
	component: InstallRoute,
});

function InstallRoute() {
	return (
		<div
			className="relative min-h-screen w-full text-landing-ink"
			style={{ colorScheme: "light" }}
		>
			<div
				aria-hidden="true"
				className="fixed inset-0 -z-10 bg-landing-surface"
			/>
			<div className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col px-6 py-12 sm:px-10 sm:py-16">
				<Link
					to="/"
					aria-label="Gloss home"
					className="flex items-center gap-2.5 self-start text-landing-ink"
				>
					<Logo variant="mark" className="h-6 w-6 text-landing-ink" />
					<span className="text-[17px] font-medium tracking-[-0.01em]">
						Gloss
					</span>
				</Link>
				<div className="flex flex-1 flex-col justify-center gap-10 py-20">
					<div className="flex flex-col gap-5">
						<span className="text-[11px] font-medium tracking-[0.14em] text-landing-ink-muted uppercase">
							Install
						</span>
						<h1 className="font-display text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.08] tracking-[-0.015em] text-landing-ink">
							Gloss is in closed beta.
						</h1>
						<p className="max-w-[52ch] text-[15px] leading-relaxed text-landing-ink-muted sm:text-base">
							We're finishing the extension's store submissions. Drop your email
							and we'll send a direct install link when the Chrome and Firefox
							builds are live.
						</p>
					</div>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
						<a
							href="mailto:hello@gloss.space?subject=Beta%20access"
							className="inline-flex items-center justify-center gap-2.5 bg-highlight-own px-5 py-3.5 text-[15px] font-medium text-landing-ink transition-opacity hover:opacity-90"
						>
							Ask for an install link <span aria-hidden="true">→</span>
						</a>
						<Link
							to="/"
							className="inline-flex items-center gap-1.5 text-[15px] text-landing-ink-muted transition-colors hover:text-landing-ink"
						>
							<span aria-hidden="true">←</span> Back to home
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}
