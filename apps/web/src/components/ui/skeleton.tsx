import { cn } from "@gloss/dashboard";

function Skeleton({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("animate-pulse rounded-none bg-muted", className)}
			data-slot="skeleton"
			{...props}
		/>
	);
}

export { Skeleton };
