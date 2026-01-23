import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
	return (
		<header className="bg-background">
			<div className="mx-auto flex h-14 max-w-4xl items-center justify-end px-6">
				<div className="flex items-center gap-2">
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
