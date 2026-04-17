import { LandingBanner } from "./landing-banner";
import { LandingBasics } from "./landing-basics";
import { LandingDemo } from "./landing-demo";
import { LandingDistinctive } from "./landing-distinctive";
import { LandingFooter } from "./landing-footer";
import { LandingGallery } from "./landing-gallery";
import { LandingHero } from "./landing-hero";
import { LandingTopBar } from "./landing-top-bar";

export function Landing() {
	return (
		<div
			className="relative min-h-screen w-full text-landing-ink"
			style={{ colorScheme: "light" }}
		>
			<div
				aria-hidden="true"
				className="fixed inset-0 -z-10 bg-landing-surface"
			/>
			<div className="mx-auto flex w-full max-w-[1440px] flex-col">
				<LandingBanner />
				<LandingTopBar />
				<main className="flex flex-col">
					<LandingHero />
					<LandingDemo />
					<LandingBasics />
					<LandingDistinctive />
					<LandingGallery />
				</main>
				<LandingFooter />
			</div>
		</div>
	);
}
