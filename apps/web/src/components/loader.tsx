import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface LoaderProps {
	className?: string;
	/** Use inline mode for buttons/small contexts (no wrapper div) */
	inline?: boolean;
}

export default function Loader({ className, inline }: LoaderProps) {
	if (inline) {
		return <Loader2 className={cn("animate-spin", className)} />;
	}

	return (
		<div className="flex h-full items-center justify-center pt-8">
			<Loader2 className={cn("animate-spin", className)} />
		</div>
	);
}
