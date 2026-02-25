import { useCallback, useEffect, useRef, useState } from "react";

import {
	BookmarkIcon,
	MonitorIcon,
	MoonIcon,
	StarIcon,
	SunIcon,
} from "../../components/icons";
import { Logo } from "../../components/logo";
import { Button } from "../../components/ui";
import { cn } from "../../utils/cn";
import {
	isErrorResponse,
	type PageMetadata,
	type ServerBookmark,
	type ServerHighlight,
	type ServerTag,
	sendMessage,
} from "../../utils/messages";
import {
	applyTheme,
	getTheme,
	initTheme,
	setTheme as saveTheme,
	type Theme,
} from "../../utils/theme";

initTheme();

interface AuthState {
	authenticated: boolean;
	user?: { id: string; name: string | null };
}

function App() {
	const [authState, setAuthState] = useState<AuthState | null>(null);
	const [highlights, setHighlights] = useState<ServerHighlight[]>([]);
	const [loading, setLoading] = useState(true);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [theme, setTheme] = useState<Theme>("system");
	const [currentPage, setCurrentPage] = useState<PageMetadata | null>(null);
	const [currentDomain, setCurrentDomain] = useState<string | null>(null);
	const [siteDisabled, setSiteDisabled] = useState(false);
	const [needsReload, setNeedsReload] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run once on mount
	useEffect(() => {
		loadData();
		loadSettings();
	}, []);

	async function loadData() {
		setLoading(true);
		try {
			const authResponse = await sendMessage({ type: "GET_AUTH_STATUS" });
			setAuthState(authResponse);

			// Query the active non-extension tab. When the popup opens as a real
			// extension popup, the active tab is the page the user is viewing. When
			// opened as a tab (e.g. in tests), the popup itself becomes active, so
			// we filter for http/https URLs and fall back to any non-extension tab.
			let [activeTab] = await browser.tabs.query({
				active: true,
				currentWindow: true,
				url: ["http://*/*", "https://*/*"],
			});
			if (!activeTab) {
				const httpTabs = await browser.tabs.query({
					currentWindow: true,
					url: ["http://*/*", "https://*/*"],
				});
				activeTab = httpTabs[httpTabs.length - 1];
			}
			const metadataResponse = await sendMessage({
				type: "GET_PAGE_METADATA",
				tabId: activeTab?.id,
			});
			setCurrentPage(metadataResponse.metadata);

			// Load current domain's disabled status
			if (metadataResponse.metadata?.url) {
				const domain = getDomain(metadataResponse.metadata.url);
				setCurrentDomain(domain);
				const stored = await browser.storage.sync.get(DISABLED_DOMAINS_KEY);
				const disabledDomains =
					(stored[DISABLED_DOMAINS_KEY] as string[]) || [];
				setSiteDisabled(disabledDomains.includes(domain));
			}

			if (authResponse.authenticated) {
				const highlightsResponse = await sendMessage({
					type: "GET_RECENT_HIGHLIGHTS",
					limit: 5,
				});
				if (!isErrorResponse(highlightsResponse)) {
					setHighlights(highlightsResponse.highlights);
				}
			}
		} catch (error) {
			console.error("[Gloss Popup] Error loading data:", error);
		} finally {
			setLoading(false);
		}
	}

	async function loadSettings() {
		const currentTheme = await getTheme();
		setTheme(currentTheme);
	}

	async function handleToggleSiteDisabled() {
		if (!currentDomain) return;
		const stored = await browser.storage.sync.get(DISABLED_DOMAINS_KEY);
		const domains = (stored[DISABLED_DOMAINS_KEY] as string[]) || [];

		if (siteDisabled) {
			// Re-enable: remove from list
			const updated = domains.filter((d) => d !== currentDomain);
			await browser.storage.sync.set({ [DISABLED_DOMAINS_KEY]: updated });
			setSiteDisabled(false);
		} else {
			// Disable: add to list
			if (!domains.includes(currentDomain)) {
				domains.push(currentDomain);
			}
			await browser.storage.sync.set({ [DISABLED_DOMAINS_KEY]: domains });
			setSiteDisabled(true);
		}
		setNeedsReload(true);
	}

	async function handleThemeChange(newTheme: Theme) {
		setTheme(newTheme);
		applyTheme(newTheme);
		await saveTheme(newTheme);
	}

	function handleSignIn() {
		const webUrl = import.meta.env.VITE_WEB_URL || "http://localhost:3001";
		browser.tabs.create({ url: `${webUrl}/login` });
	}

	async function handleSignOut() {
		try {
			const baseUrl =
				import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
			await fetch(`${baseUrl}/api/auth/sign-out`, {
				method: "POST",
				credentials: "include",
			});
			// Try to explicitly clear the session cookie via extension cookies API
			// (requires "cookies" permission — fails gracefully if not available)
			try {
				await browser.cookies.remove({
					name: "better-auth.session_token",
					url: baseUrl,
				});
			} catch {
				// cookies permission may not be available
			}
			setAuthState({ authenticated: false });
			setHighlights([]);
		} catch (error) {
			console.error("[Gloss Popup] Error signing out:", error);
		}
	}

	function openHighlight(url: string) {
		browser.tabs.create({ url });
	}

	const canSavePage =
		currentPage?.url &&
		!currentPage.url.startsWith("chrome://") &&
		!currentPage.url.startsWith("chrome-extension://") &&
		!currentPage.url.startsWith("about:") &&
		!currentPage.url.startsWith("edge://") &&
		!currentPage.url.startsWith("moz-extension://");

	if (loading) {
		return (
			<div className="flex max-h-[600px] min-h-[200px] flex-col">
				<header className="flex items-center justify-between border-b border-border p-4">
					<Logo className="h-5 w-auto text-foreground" />
				</header>
				<main className="overflow-y-auto px-4 py-2 pb-4">
					<p className="text-xs text-muted-foreground">Loading...</p>
				</main>
			</div>
		);
	}

	return (
		<div className="flex max-h-[600px] min-h-[200px] flex-col">
			<header className="border-b border-border p-4">
				<div className="flex items-center justify-between">
					<Logo className="h-5 w-auto text-foreground" />
					{currentDomain && (
						<div className="flex items-center gap-2">
							<span
								className={cn(
									"max-w-[140px] truncate text-[11px]",
									siteDisabled ? "text-destructive/70" : "text-muted-foreground"
								)}
							>
								{currentDomain}
							</span>
							<button
								onClick={handleToggleSiteDisabled}
								className={cn(
									"relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full border-none transition-colors",
									siteDisabled ? "bg-muted" : "bg-primary dark:bg-green-600"
								)}
								title={
									siteDisabled
										? `Re-enable Gloss on ${currentDomain}`
										: `Disable Gloss on ${currentDomain}`
								}
								type="button"
								role="switch"
								aria-checked={!siteDisabled}
							>
								<span
									className={cn(
										"inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform",
										siteDisabled ? "translate-x-[3px]" : "translate-x-[19px]"
									)}
								/>
							</button>
						</div>
					)}
				</div>
				{needsReload && (
					<p className="mt-1.5 text-right text-[10px] text-muted-foreground/70">
						Reload the page to apply
					</p>
				)}
			</header>

			<main className="overflow-y-auto px-4 py-2 pb-4">
				{/* Auth Prompt */}
				{!authState?.authenticated && (
					<section className="border-b border-border py-3">
						<div className="py-2 text-center">
							<p className="mb-3 text-xs text-muted-foreground">
								Sign in to bookmark and highlight
							</p>
							<Button onClick={handleSignIn} variant="primary">
								Sign in
							</Button>
						</div>
					</section>
				)}

				{/* Bookmark Section */}
				{authState?.authenticated && canSavePage && currentPage && (
					<BookmarkSection metadata={currentPage} />
				)}

				{/* Recent Highlights */}
				{authState?.authenticated && (
					<section className="border-b border-border py-2 last:border-b-0">
						<h2 className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground/80 uppercase">
							Recent highlights
						</h2>
						{highlights.length > 0 ? (
							<ul className="flex flex-col gap-1.5">
								{highlights.map((highlight) => (
									<li key={highlight.id}>
										<button
											className="hover:bg-highlight flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg border border-border bg-transparent px-2.5 py-2 text-left transition-colors"
											onClick={() => openHighlight(highlight.url)}
											type="button"
										>
											<span className="line-clamp-2 text-xs leading-snug text-foreground">
												"{truncate(highlight.text, 80)}"
											</span>
											<span className="text-[10px] text-muted-foreground">
												{getDomain(highlight.url)} ·{" "}
												{formatRelativeTime(highlight.createdAt)}
											</span>
										</button>
									</li>
								))}
							</ul>
						) : (
							<p className="text-xs text-muted-foreground">No highlights yet</p>
						)}
					</section>
				)}

				{/* Settings */}
				<section className="py-2">
					<button
						className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent p-0"
						onClick={() => setSettingsOpen(!settingsOpen)}
						type="button"
					>
						<span className="text-[10px] font-medium tracking-wide text-muted-foreground/80 uppercase">
							Settings
						</span>
						<span className="text-sm text-muted-foreground">
							{settingsOpen ? "−" : "+"}
						</span>
					</button>

					{settingsOpen && (
						<div className="mt-3 flex flex-col gap-1.5">
							{/* Account info */}
							{authState?.authenticated && (
								<div className="mb-2 flex items-center justify-between rounded-md bg-secondary p-2 px-2.5">
									<div className="flex items-center gap-2">
										<span className="size-2 rounded-full bg-green-500" />
										<span className="text-[13px] text-foreground">
											{authState.user?.name || "User"}
										</span>
									</div>
									<Button onClick={handleSignOut} variant="link">
										Sign out
									</Button>
								</div>
							)}

							{/* Theme selector */}
							<label className="text-xs text-muted-foreground" htmlFor="theme">
								Theme
							</label>
							<div className="mb-3 flex gap-1.5">
								<button
									className={cn(
										"flex flex-1 cursor-pointer items-center justify-center rounded-md border p-2 text-base transition-all",
										theme === "light"
											? "border-primary bg-primary text-primary-foreground"
											: "hover:bg-highlight border-border bg-secondary"
									)}
									onClick={() => handleThemeChange("light")}
									title="Light"
									type="button"
								>
									<SunIcon />
								</button>
								<button
									className={cn(
										"flex flex-1 cursor-pointer items-center justify-center rounded-md border p-2 text-base transition-all",
										theme === "dark"
											? "border-primary bg-primary text-primary-foreground"
											: "hover:bg-highlight border-border bg-secondary"
									)}
									onClick={() => handleThemeChange("dark")}
									title="Dark"
									type="button"
								>
									<MoonIcon />
								</button>
								<button
									className={cn(
										"flex flex-1 cursor-pointer items-center justify-center rounded-md border p-2 text-base transition-all",
										theme === "system"
											? "border-primary bg-primary text-primary-foreground"
											: "hover:bg-highlight border-border bg-secondary"
									)}
									onClick={() => handleThemeChange("system")}
									title="System"
									type="button"
								>
									<MonitorIcon />
								</button>
							</div>

							{/* Disabled sites */}
							<DisabledSitesSection />
						</div>
					)}
				</section>
			</main>
		</div>
	);
}

// =============================================================================
// BookmarkSection Component
// =============================================================================

interface BookmarkSectionProps {
	metadata: PageMetadata;
}

function BookmarkSection({ metadata }: BookmarkSectionProps) {
	const [status, setStatus] = useState<
		"loading" | "bookmarked" | "unbookmarked"
	>("loading");
	const [bookmark, setBookmark] = useState<ServerBookmark | null>(null);
	const [tags, setTags] = useState<string[]>([]);
	const [isFavorite, setIsFavorite] = useState(false);
	const [isToRead, setIsToRead] = useState(false);
	const [saving, setSaving] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: checkBookmarkStatus changes on every render
	useEffect(() => {
		checkBookmarkStatus();
	}, [metadata.url]);

	async function checkBookmarkStatus() {
		setStatus("loading");
		try {
			const response = await sendMessage({
				type: "GET_BOOKMARK_STATUS",
				url: metadata.url,
			});
			if (isErrorResponse(response)) {
				console.error("[Gloss Popup] Error checking bookmark:", response.error);
				setStatus("unbookmarked");
				return;
			}
			if (response.bookmarked && response.bookmark) {
				setStatus("bookmarked");
				setBookmark(response.bookmark);
				const tagNames = response.bookmark.tags.map((t) => t.name);
				setTags(tagNames.filter((t) => t !== "favorites" && t !== "to-read"));
				setIsFavorite(tagNames.includes("favorites"));
				setIsToRead(tagNames.includes("to-read"));
			} else {
				setStatus("unbookmarked");
			}
		} catch (error) {
			console.error("[Gloss Popup] Error checking bookmark:", error);
			setStatus("unbookmarked");
		}
	}

	async function handleBookmark() {
		setSaving(true);
		try {
			const response = await sendMessage({
				type: "SAVE_BOOKMARK",
				url: metadata.url,
				title: metadata.title || undefined,
				favicon: metadata.favicon || undefined,
				ogImage: metadata.ogImage || undefined,
				ogDescription: metadata.ogDescription || undefined,
				siteName: metadata.siteName || undefined,
				tags: tags.length > 0 ? tags : undefined,
			});
			if (isErrorResponse(response)) {
				console.error("[Gloss Popup] Error saving bookmark:", response.error);
				return;
			}
			setBookmark(response.bookmark);
			setStatus("bookmarked");
		} catch (error) {
			console.error("[Gloss Popup] Error saving bookmark:", error);
		} finally {
			setSaving(false);
		}
	}

	async function handleUnbookmark() {
		if (!bookmark) {
			return;
		}
		try {
			const response = await sendMessage({
				type: "DELETE_BOOKMARK",
				id: bookmark.id,
			});
			if (isErrorResponse(response)) {
				console.error("[Gloss Popup] Error removing bookmark:", response.error);
				return;
			}
			setBookmark(null);
			setTags([]);
			setIsFavorite(false);
			setIsToRead(false);
			setStatus("unbookmarked");
		} catch (error) {
			console.error("[Gloss Popup] Error removing bookmark:", error);
		}
	}

	async function handleToggleFavorite() {
		if (status === "unbookmarked") {
			setSaving(true);
			try {
				const response = await sendMessage({
					type: "SAVE_BOOKMARK",
					url: metadata.url,
					title: metadata.title || undefined,
					favicon: metadata.favicon || undefined,
					ogImage: metadata.ogImage || undefined,
					ogDescription: metadata.ogDescription || undefined,
					siteName: metadata.siteName || undefined,
					tags: ["favorites"],
				});
				if (isErrorResponse(response)) {
					console.error("[Gloss Popup] Error saving bookmark:", response.error);
					return;
				}
				setBookmark(response.bookmark);
				setStatus("bookmarked");
				setIsFavorite(true);
			} catch (error) {
				console.error("[Gloss Popup] Error saving bookmark:", error);
			} finally {
				setSaving(false);
			}
			return;
		}

		if (!bookmark) {
			return;
		}
		try {
			const response = await sendMessage({
				type: "TOGGLE_FAVORITE",
				id: bookmark.id,
			});
			if (isErrorResponse(response)) {
				console.error("[Gloss Popup] Error toggling favorite:", response.error);
				return;
			}
			setIsFavorite(response.favorited);
		} catch (error) {
			console.error("[Gloss Popup] Error toggling favorite:", error);
		}
	}

	async function handleToggleToRead() {
		if (status === "unbookmarked") {
			setSaving(true);
			try {
				const response = await sendMessage({
					type: "SAVE_BOOKMARK",
					url: metadata.url,
					title: metadata.title || undefined,
					favicon: metadata.favicon || undefined,
					ogImage: metadata.ogImage || undefined,
					ogDescription: metadata.ogDescription || undefined,
					siteName: metadata.siteName || undefined,
					tags: ["to-read"],
				});
				if (isErrorResponse(response)) {
					console.error("[Gloss Popup] Error saving bookmark:", response.error);
					return;
				}
				setBookmark(response.bookmark);
				setStatus("bookmarked");
				setIsToRead(true);
			} catch (error) {
				console.error("[Gloss Popup] Error saving bookmark:", error);
			} finally {
				setSaving(false);
			}
			return;
		}

		if (!bookmark) {
			return;
		}
		try {
			const response = await sendMessage({
				type: "TOGGLE_READ_LATER",
				id: bookmark.id,
			});
			if (isErrorResponse(response)) {
				console.error("[Gloss Popup] Error toggling to-read:", response.error);
				return;
			}
			setIsToRead(response.toRead);
		} catch (error) {
			console.error("[Gloss Popup] Error toggling to-read:", error);
		}
	}

	async function handleTagsChange(newTags: string[]) {
		setTags(newTags);
		if (bookmark) {
			const allTags = [
				...newTags,
				...(isFavorite ? ["favorites"] : []),
				...(isToRead ? ["to-read"] : []),
			];
			try {
				const response = await sendMessage({
					type: "UPDATE_BOOKMARK",
					id: bookmark.id,
					tags: allTags,
				});
				if (!isErrorResponse(response)) {
					setBookmark(response.bookmark);
				}
			} catch (error) {
				console.error("[Gloss Popup] Error updating tags:", error);
			}
		}
	}

	if (status === "loading") {
		return (
			<section className="my-2 mb-3 rounded-xl border border-border bg-gradient-to-b from-secondary to-background p-4 dark:from-card dark:to-background">
				<div className="flex items-center justify-center py-3">
					<span className="text-xs text-muted-foreground">Checking...</span>
				</div>
			</section>
		);
	}

	const isBookmarked = status === "bookmarked";

	return (
		<section className="my-2 mb-3 rounded-xl border border-border bg-gradient-to-b from-secondary to-background p-4 dark:from-card dark:to-background">
			{/* Page info */}
			<div className="mb-3 flex items-center gap-2.5">
				{metadata.favicon && (
					// biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError is for graceful fallback
					<img
						alt=""
						className="size-5 flex-shrink-0 rounded"
						height={20}
						onError={(e) => {
							(e.target as HTMLImageElement).style.display = "none";
						}}
						src={metadata.favicon}
						width={20}
					/>
				)}
				<span className="line-clamp-2 flex-1 text-sm leading-snug font-medium text-foreground">
					{metadata.title || getDomain(metadata.url)}
				</span>
			</div>

			{/* Actions row */}
			<div className="flex items-center justify-between gap-2">
				{/* System tag toggles */}
				<div className="flex gap-1.5">
					<button
						className={cn(
							"flex size-8 cursor-pointer items-center justify-center rounded-lg border bg-transparent transition-all hover:-translate-y-px",
							isFavorite
								? "bg-favorite-bg text-favorite-text border-transparent"
								: "border-border text-muted-foreground hover:border-muted-foreground"
						)}
						onClick={handleToggleFavorite}
						title={isFavorite ? "Remove from favorites" : "Add to favorites"}
						type="button"
					>
						<StarIcon filled={isFavorite} />
					</button>
					<button
						className={cn(
							"flex size-8 cursor-pointer items-center justify-center rounded-lg border bg-transparent transition-all hover:-translate-y-px",
							isToRead
								? "bg-read-later-bg text-read-later-text border-transparent"
								: "border-border text-muted-foreground hover:border-muted-foreground"
						)}
						onClick={handleToggleToRead}
						title={isToRead ? "Remove from read later" : "Add to read later"}
						type="button"
					>
						<BookmarkIcon filled={isToRead} />
					</button>
				</div>

				{/* Primary CTA */}
				{isBookmarked ? (
					<button
						className="cursor-pointer rounded-lg border border-border bg-secondary px-4 py-2 text-[13px] font-medium text-foreground transition-all hover:-translate-y-px hover:border-muted-foreground hover:bg-background"
						onClick={handleUnbookmark}
						type="button"
					>
						Bookmarked ✓
					</button>
				) : (
					<button
						className="cursor-pointer rounded-lg border-none bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-all hover:-translate-y-px hover:opacity-90 disabled:transform-none disabled:cursor-not-allowed disabled:opacity-60"
						disabled={saving}
						onClick={handleBookmark}
						type="button"
					>
						{saving ? "Saving..." : "Bookmark"}
					</button>
				)}
			</div>

			{/* Tag input */}
			{isBookmarked && (
				<TagInput excludeSystemTags onChange={handleTagsChange} tags={tags} />
			)}
		</section>
	);
}

// =============================================================================
// TagInput Component
// =============================================================================

interface TagInputProps {
	tags: string[];
	onChange: (tags: string[]) => void;
	excludeSystemTags?: boolean;
}

const SYSTEM_TAG_NAMES = ["favorites", "to-read"];

function TagInput({
	tags,
	onChange,
	excludeSystemTags = false,
}: TagInputProps) {
	const [input, setInput] = useState("");
	const [suggestions, setSuggestions] = useState<ServerTag[]>([]);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const loadSuggestions = useCallback(async () => {
		try {
			const response = await sendMessage({ type: "GET_USER_TAGS" });
			if (!isErrorResponse(response)) {
				setSuggestions(response.tags);
			}
		} catch (error) {
			console.error("[Gloss Popup] Error loading tags:", error);
		}
	}, []);

	useEffect(() => {
		loadSuggestions();
	}, [loadSuggestions]);

	function handleInputChange(value: string) {
		setInput(value);
		setShowSuggestions(value.length > 0 || suggestions.length > 0);
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter" || e.key === ",") {
			e.preventDefault();
			addTag(input.trim());
		} else if (e.key === "Backspace" && input === "" && tags.length > 0) {
			onChange(tags.slice(0, -1));
		}
	}

	function addTag(tagName: string) {
		if (!tagName) {
			return;
		}
		const normalized = tagName.toLowerCase().trim();
		if (normalized && !tags.includes(normalized)) {
			onChange([...tags, normalized]);
		}
		setInput("");
		setShowSuggestions(false);
	}

	function removeTag(tagToRemove: string) {
		onChange(tags.filter((t) => t !== tagToRemove));
	}

	const filteredSuggestions = suggestions.filter(
		(s) =>
			!tags.includes(s.name) &&
			s.name.toLowerCase().includes(input.toLowerCase()) &&
			!(excludeSystemTags && SYSTEM_TAG_NAMES.includes(s.name))
	);

	return (
		<div className="relative mt-2.5">
			<div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-1.5 px-2">
				{tags.map((tag) => (
					<span
						className="bg-highlight inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-foreground"
						key={tag}
					>
						{tag}
						<button
							aria-label={`Remove ${tag}`}
							className="ml-0.5 cursor-pointer border-none bg-transparent p-0 text-xs leading-none text-muted-foreground opacity-70 hover:opacity-100"
							onClick={() => removeTag(tag)}
							type="button"
						>
							×
						</button>
					</span>
				))}
				<input
					className="min-w-[60px] flex-1 border-none bg-transparent px-1 py-0.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
					onBlur={() => {
						setTimeout(() => setShowSuggestions(false), 150);
					}}
					onChange={(e) => handleInputChange(e.target.value)}
					onFocus={() =>
						setShowSuggestions(input.length > 0 || suggestions.length > 0)
					}
					onKeyDown={handleKeyDown}
					placeholder={tags.length === 0 ? "Add tags..." : ""}
					ref={inputRef}
					type="text"
					value={input}
				/>
			</div>

			{showSuggestions && filteredSuggestions.length > 0 && (
				<div className="absolute top-full right-0 left-0 z-10 mt-1 max-h-[120px] overflow-y-auto rounded-md border border-border bg-background shadow-lg">
					{filteredSuggestions.slice(0, 3).map((suggestion) => (
						<button
							className="block w-full cursor-pointer border-none bg-transparent px-3 py-2 text-left text-xs text-foreground transition-colors first:rounded-t-md last:rounded-b-md hover:bg-secondary"
							key={suggestion.id}
							onClick={() => addTag(suggestion.name)}
							type="button"
						>
							{suggestion.name}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

// =============================================================================
// DisabledSitesSection Component
// =============================================================================

const DISABLED_DOMAINS_KEY = "glossDisabledDomains";

function DisabledSitesSection() {
	const [domains, setDomains] = useState<string[]>([]);

	useEffect(() => {
		browser.storage.sync
			.get(DISABLED_DOMAINS_KEY)
			.then((result) => {
				setDomains((result[DISABLED_DOMAINS_KEY] as string[]) || []);
				return undefined;
			})
			.catch(() => {});
	}, []);

	async function removeDomain(domain: string) {
		const updated = domains.filter((d) => d !== domain);
		setDomains(updated);
		await browser.storage.sync.set({ [DISABLED_DOMAINS_KEY]: updated });
	}

	if (domains.length === 0) return null;

	return (
		<div className="mt-3">
			<p className="text-xs text-muted-foreground">Disabled sites</p>
			<ul className="mt-1.5 flex flex-col gap-1">
				{domains.map((domain) => (
					<li
						key={domain}
						className="flex items-center justify-between rounded-md bg-secondary px-2.5 py-1.5"
					>
						<span className="text-xs text-foreground">{domain}</span>
						<button
							onClick={() => removeDomain(domain)}
							className="cursor-pointer border-none bg-transparent p-0 text-sm leading-none text-muted-foreground hover:text-destructive"
							title={`Re-enable Gloss on ${domain}`}
							type="button"
						>
							×
						</button>
					</li>
				))}
			</ul>
			<p className="mt-1 text-[11px] text-muted-foreground/80">
				Reload the page after re-enabling
			</p>
		</div>
	);
}

// =============================================================================
// Utility Functions
// =============================================================================

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	return `${text.slice(0, maxLength).trim()}...`;
}

const WWW_REGEX = /^www\./;

function getDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(WWW_REGEX, "");
	} catch {
		return url;
	}
}

function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSeconds < 60) {
		return "just now";
	}
	if (diffMinutes < 60) {
		return `${diffMinutes}m`;
	}
	if (diffHours < 24) {
		return `${diffHours}h`;
	}
	if (diffDays < 30) {
		return `${diffDays}d`;
	}

	return date.toLocaleDateString();
}

export default App;
