/** @jsxImportSource react */
interface LogoProps {
	className?: string;
	/** Show full "Gloss" text or just the "|G" mark */
	variant?: "full" | "mark";
}

export function Logo({ className, variant = "full" }: LogoProps) {
	if (variant === "mark") {
		return (
			<svg
				className={className}
				fill="none"
				role="img"
				viewBox="0 0 512 512"
				xmlns="http://www.w3.org/2000/svg"
			>
				<title>Gloss</title>
				<text
					fill="currentColor"
					fontFamily="Satoshi"
					fontSize="400"
					fontWeight="bold"
					letterSpacing="-0.02em"
					xmlSpace="preserve"
				>
					<tspan x="140" y="400">
						G
					</tspan>
				</text>
				<path d="M80 56L80 456" stroke="currentColor" strokeWidth="40" />
			</svg>
		);
	}

	return (
		<svg
			className={className}
			fill="none"
			role="img"
			viewBox="0 0 839 360"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Gloss</title>
			<text
				fill="currentColor"
				fontFamily="Satoshi"
				fontSize="236.983"
				fontWeight="bold"
				letterSpacing="-0.02em"
				xmlSpace="preserve"
			>
				<tspan x="146" y="291.239">
					Gloss
				</tspan>
			</text>
			<path d="M87 40L87 312" stroke="currentColor" strokeWidth="20" />
		</svg>
	);
}
