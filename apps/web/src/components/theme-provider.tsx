import { api } from "@convex/_generated/api";
import { Authenticated, useMutation, useQuery } from "convex/react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useCallback, useEffect, useRef, type ComponentProps } from "react";

export function ThemeProvider({
	children,
	...props
}: ComponentProps<typeof NextThemesProvider>) {
	return (
		<NextThemesProvider {...props}>
			<Authenticated>
				<ThemeSync />
			</Authenticated>
			{children}
		</NextThemesProvider>
	);
}

function ThemeSync() {
	const settings = useQuery(api.users.getSettings);
	const { setTheme, theme } = useTheme();

	useEffect(() => {
		if (!settings) return;
		if (settings.themePreference !== theme) {
			setTheme(settings.themePreference);
		}
	}, [settings, setTheme, theme]);

	return null;
}

type ThemeChoice = "light" | "dark" | "system";

export function useSyncedTheme() {
	const settings = useQuery(api.users.getSettings);
	const { theme, setTheme } = useTheme();
	const updateSettings = useMutation(api.users.updateSettings);
	const lastPushedRef = useRef<ThemeChoice | null>(null);

	const setSyncedTheme = useCallback(
		(next: ThemeChoice) => {
			setTheme(next);
			if (settings && lastPushedRef.current !== next) {
				lastPushedRef.current = next;
				updateSettings({ themePreference: next }).catch((err) => {
					console.error("[Gloss] Failed to persist theme:", err);
				});
			}
		},
		[setTheme, settings, updateSettings]
	);

	return { theme, setTheme: setSyncedTheme };
}
