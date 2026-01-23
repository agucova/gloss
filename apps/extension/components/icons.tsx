interface IconProps {
	className?: string;
	size?: number;
}

export function SunIcon({ className, size = 16 }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			height={size}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width={size}
		>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
		</svg>
	);
}

export function MoonIcon({ className, size = 16 }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			height={size}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width={size}
		>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
	);
}

export function MonitorIcon({ className, size = 16 }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			height={size}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width={size}
		>
			<rect height="14" rx="2" ry="2" width="20" x="2" y="3" />
			<line x1="8" x2="16" y1="21" y2="21" />
			<line x1="12" x2="12" y1="17" y2="21" />
		</svg>
	);
}

export function StarIcon({
	className,
	size = 16,
	filled = false,
}: IconProps & { filled?: boolean }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill={filled ? "currentColor" : "none"}
			height={size}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width={size}
		>
			<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
		</svg>
	);
}

export function BookmarkIcon({
	className,
	size = 16,
	filled = false,
}: IconProps & { filled?: boolean }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill={filled ? "currentColor" : "none"}
			height={size}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width={size}
		>
			<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
		</svg>
	);
}

export function SearchIcon({ className, size = 16 }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			height={size}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width={size}
		>
			<circle cx="11" cy="11" r="8" />
			<line x1="21" x2="16.65" y1="21" y2="16.65" />
		</svg>
	);
}

export function ExternalLinkIcon({ className, size = 16 }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			height={size}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width={size}
		>
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
			<polyline points="15 3 21 3 21 9" />
			<line x1="10" x2="21" y1="14" y2="3" />
		</svg>
	);
}
