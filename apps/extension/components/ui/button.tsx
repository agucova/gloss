import type { ComponentProps } from "react";
import { cn } from "../../utils/cn";

interface ButtonProps extends ComponentProps<"button"> {
	variant?: "primary" | "secondary" | "ghost" | "link";
	size?: "sm" | "md" | "icon";
}

export function Button({
	variant = "primary",
	size = "md",
	className,
	...props
}: ButtonProps) {
	return (
		<button
			className={cn(
				"inline-flex items-center justify-center font-medium transition-all duration-150",
				"disabled:transform-none disabled:cursor-not-allowed disabled:opacity-60",
				variant === "primary" &&
					"rounded-lg bg-primary text-primary-foreground hover:opacity-90 active:opacity-80",
				variant === "secondary" &&
					"rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted",
				variant === "ghost" &&
					"rounded-lg bg-transparent text-foreground hover:bg-muted",
				variant === "link" &&
					"bg-transparent p-0 text-muted-foreground underline underline-offset-2 hover:text-foreground",
				size === "sm" && "px-3 py-1.5 text-xs",
				size === "md" && "px-4 py-2 text-[13px]",
				size === "icon" && "size-8",
				className
			)}
			{...props}
		/>
	);
}
