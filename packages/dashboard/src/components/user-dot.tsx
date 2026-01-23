import { cn } from "../utils/cn";
import { getUserColor } from "../utils/user-colors";

interface UserDotProps {
	userId: string;
	className?: string;
}

/**
 * A small colored dot that represents a user.
 * Color is deterministic based on user ID.
 */
export function UserDot({ userId, className }: UserDotProps) {
	const color = getUserColor(userId);

	return (
		<span
			aria-hidden="true"
			className={cn("inline-block size-2 shrink-0 rounded-full", className)}
			style={{ backgroundColor: color }}
		/>
	);
}
