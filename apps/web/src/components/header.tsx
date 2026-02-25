import { Link, useMatches } from "@tanstack/react-router";
import { Clock, Library } from "lucide-react";

import { Logo } from "./logo";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
	const matches = useMatches();
	const isFullWidth = matches.some(
		(match) => match.pathname.startsWith("/u/") && match.pathname !== "/u/setup"
	);
	const isLibrary = matches.some((match) => match.pathname === "/library");
	const isReadLater = matches.some((match) => match.pathname === "/read-later");

	return (
		<header className="bg-background">
			<div
				className={`mx-auto flex h-14 items-center justify-between px-6 ${
					isFullWidth ? "max-w-7xl" : "max-w-4xl"
				}`}
			>
				<div className="flex items-center gap-6">
					<Link className="text-foreground" to="/">
						<Logo className="h-6 w-auto" />
					</Link>
					<Link
						className={`flex items-center gap-1.5 text-sm transition-colors ${
							isReadLater
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
						to="/read-later"
					>
						<Clock className="h-4 w-4" />
						<span>Read Later</span>
					</Link>
					<Link
						className={`flex items-center gap-1.5 text-sm transition-colors ${
							isLibrary
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
						to="/library"
					>
						<Library className="h-4 w-4" />
						<span>Library</span>
					</Link>
				</div>
				<div className="flex items-center gap-2">
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
