interface LandingDemoProps {
	/** When a real screen recording exists, pass its path here and the placeholder is replaced. */
	src?: string;
	poster?: string;
}

export function LandingDemo({ src, poster }: LandingDemoProps) {
	return (
		<section className="flex w-full justify-center px-6 pt-28 sm:px-16">
			<div className="w-full max-w-[920px]">
				{src ? (
					<video
						className="block h-auto w-full border border-landing-rule bg-landing-surface-2"
						src={src}
						poster={poster}
						autoPlay
						loop
						muted
						playsInline
						preload="metadata"
					>
						<track kind="captions" />
					</video>
				) : (
					<div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 border border-landing-rule bg-landing-surface-2 text-landing-ink">
						<div className="flex items-center gap-3.5">
							<span
								aria-hidden="true"
								className="flex h-10 w-10 items-center justify-center rounded-full border border-landing-ink"
							>
								<span className="ml-[3px] h-0 w-0 border-y-[7px] border-l-[10px] border-y-transparent border-l-landing-ink" />
							</span>
							<span className="font-display text-[22px] leading-none">
								A minute of the extension, in use
							</span>
						</div>
						<span className="text-[13px] tracking-[0.02em] text-landing-ink-subtle">
							[placeholder: screen recording drops in here]
						</span>
					</div>
				)}
			</div>
		</section>
	);
}
