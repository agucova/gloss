import {
	For,
	Show,
	createEffect,
	createMemo,
	createSignal,
	onMount,
} from "solid-js";

import type { PageMetadata } from "../../utils/metadata";

import { cn } from "../../utils/cn";
import {
	isErrorResponse,
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
	const [authState, setAuthState] = createSignal<AuthState | null>(null);
	const [highlights, setHighlights] = createSignal<ServerHighlight[]>([]);
	const [loading, setLoading] = createSignal(true);
	const [settingsOpen, setSettingsOpen] = createSignal(false);
	const [theme, setTheme] = createSignal<Theme>("system");
	const [currentPage, setCurrentPage] = createSignal<PageMetadata | null>(null);
	const [currentDomain, setCurrentDomain] = createSignal<string | null>(null);
	const [siteDisabled, setSiteDisabled] = createSignal(false);
	const [needsReload, setNeedsReload] = createSignal(false);

	onMount(() => {
		loadData();
		loadSettings();
	});

	async function loadData() {
		setLoading(true);
		try {
			const authResponse = await sendMessage({ type: "GET_AUTH_STATUS" });
			setAuthState(authResponse);

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
		const domain = currentDomain();
		if (!domain) return;
		const stored = await browser.storage.sync.get(DISABLED_DOMAINS_KEY);
		const domains = (stored[DISABLED_DOMAINS_KEY] as string[]) || [];

		if (siteDisabled()) {
			const updated = domains.filter((d) => d !== domain);
			await browser.storage.sync.set({ [DISABLED_DOMAINS_KEY]: updated });
			setSiteDisabled(false);
		} else {
			if (!domains.includes(domain)) {
				domains.push(domain);
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

	const canSavePage = createMemo(() => {
		const page = currentPage();
		return (
			page?.url &&
			!page.url.startsWith("chrome://") &&
			!page.url.startsWith("chrome-extension://") &&
			!page.url.startsWith("about:") &&
			!page.url.startsWith("edge://") &&
			!page.url.startsWith("moz-extension://")
		);
	});

	return (
		<Show
			when={!loading()}
			fallback={
				<div class="flex max-h-[600px] min-h-[200px] flex-col">
					<header class="flex items-center justify-between border-b border-border p-4">
						<Logo class="h-5 w-auto text-foreground" />
					</header>
					<main class="overflow-y-auto px-4 py-2 pb-4">
						<p class="text-xs text-muted-foreground">Loading...</p>
					</main>
				</div>
			}
		>
			<div class="flex max-h-[600px] min-h-[200px] flex-col">
				<header class="border-b border-border p-4">
					<div class="flex items-center justify-between">
						<Logo class="h-5 w-auto text-foreground" />
						<Show when={currentDomain()}>
							<div class="flex items-center gap-2">
								<span
									class={cn(
										"max-w-[140px] truncate text-[11px]",
										siteDisabled()
											? "text-destructive/70"
											: "text-muted-foreground"
									)}
								>
									{currentDomain()}
								</span>
								<button
									onClick={handleToggleSiteDisabled}
									class={cn(
										"relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full border-none transition-colors",
										siteDisabled() ? "bg-muted" : "bg-primary dark:bg-green-600"
									)}
									title={
										siteDisabled()
											? `Re-enable Gloss on ${currentDomain()}`
											: `Disable Gloss on ${currentDomain()}`
									}
									type="button"
									role="switch"
									aria-checked={!siteDisabled()}
								>
									<span
										class={cn(
											"inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform",
											siteDisabled()
												? "translate-x-[3px]"
												: "translate-x-[19px]"
										)}
									/>
								</button>
							</div>
						</Show>
					</div>
					<Show when={needsReload()}>
						<p class="mt-1.5 text-right text-[10px] text-muted-foreground/70">
							Reload the page to apply
						</p>
					</Show>
				</header>

				<main class="overflow-y-auto px-4 py-2 pb-4">
					{/* Auth Prompt */}
					<Show when={!authState()?.authenticated}>
						<section class="border-b border-border py-3">
							<div class="py-2 text-center">
								<p class="mb-3 text-xs text-muted-foreground">
									Sign in to bookmark and highlight
								</p>
								<Button onClick={handleSignIn} variant="primary">
									Sign in
								</Button>
							</div>
						</section>
					</Show>

					{/* Bookmark Section */}
					<Show
						when={
							authState()?.authenticated && canSavePage() ? currentPage() : null
						}
					>
						{(page) => <BookmarkSection metadata={page()} />}
					</Show>

					{/* Recent Highlights */}
					<Show when={authState()?.authenticated}>
						<section class="border-b border-border py-2 last:border-b-0">
							<h2 class="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground/80 uppercase">
								Recent highlights
							</h2>
							<Show
								when={highlights().length > 0}
								fallback={
									<p class="text-xs text-muted-foreground">No highlights yet</p>
								}
							>
								<ul class="flex flex-col gap-1.5">
									<For each={highlights()}>
										{(highlight) => (
											<li>
												<button
													class="hover:bg-highlight flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg border border-border bg-transparent px-2.5 py-2 text-left transition-colors"
													onClick={() => openHighlight(highlight.url)}
													type="button"
												>
													<span class="line-clamp-2 text-xs leading-snug text-foreground">
														"{truncate(highlight.text, 80)}"
													</span>
													<span class="text-[10px] text-muted-foreground">
														{getDomain(highlight.url)} ·{" "}
														{formatRelativeTime(highlight.createdAt)}
													</span>
												</button>
											</li>
										)}
									</For>
								</ul>
							</Show>
						</section>
					</Show>

					{/* Settings */}
					<section class="py-2">
						<button
							class="flex w-full cursor-pointer items-center justify-between border-none bg-transparent p-0"
							onClick={() => setSettingsOpen(!settingsOpen())}
							type="button"
						>
							<span class="text-[10px] font-medium tracking-wide text-muted-foreground/80 uppercase">
								Settings
							</span>
							<span class="text-sm text-muted-foreground">
								{settingsOpen() ? "−" : "+"}
							</span>
						</button>

						<Show when={settingsOpen()}>
							<div class="mt-3 flex flex-col gap-1.5">
								{/* Account info */}
								<Show when={authState()?.authenticated}>
									<div class="mb-2 flex items-center justify-between rounded-md bg-secondary p-2 px-2.5">
										<div class="flex items-center gap-2">
											<span class="size-2 rounded-full bg-green-500" />
											<span class="text-[13px] text-foreground">
												{authState()?.user?.name || "User"}
											</span>
										</div>
										<Button onClick={handleSignOut} variant="link">
											Sign out
										</Button>
									</div>
								</Show>

								{/* Theme selector */}
								<span class="text-xs text-muted-foreground" id="theme-label">
									Theme
								</span>
								<div class="mb-3 flex gap-1.5">
									<button
										class={cn(
											"flex flex-1 cursor-pointer items-center justify-center rounded-md border p-2 text-base transition-all",
											theme() === "light"
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
										class={cn(
											"flex flex-1 cursor-pointer items-center justify-center rounded-md border p-2 text-base transition-all",
											theme() === "dark"
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
										class={cn(
											"flex flex-1 cursor-pointer items-center justify-center rounded-md border p-2 text-base transition-all",
											theme() === "system"
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
						</Show>
					</section>
				</main>
			</div>
		</Show>
	);
}

// =============================================================================
// BookmarkSection Component
// =============================================================================

interface BookmarkSectionProps {
	metadata: PageMetadata;
}

function BookmarkSection(props: BookmarkSectionProps) {
	const [status, setStatus] = createSignal<
		"loading" | "bookmarked" | "unbookmarked"
	>("loading");
	const [bookmark, setBookmark] = createSignal<ServerBookmark | null>(null);
	const [tags, setTags] = createSignal<string[]>([]);
	const [isFavorite, setIsFavorite] = createSignal(false);
	const [isToRead, setIsToRead] = createSignal(false);
	const [saving, setSaving] = createSignal(false);

	createEffect(() => {
		// Track metadata.url to re-check when it changes
		const _url = props.metadata.url;
		checkBookmarkStatus();
	});

	async function checkBookmarkStatus() {
		setStatus("loading");
		try {
			const response = await sendMessage({
				type: "GET_BOOKMARK_STATUS",
				url: props.metadata.url,
			});
			if (isErrorResponse(response)) {
				console.error("[Gloss Popup] Error checking bookmark:", response.error);
				setStatus("unbookmarked");
				return;
			}
			if (response.bookmarked && response.bookmark) {
				setStatus("bookmarked");
				setBookmark(response.bookmark);
				const tagNames = response.bookmark.tags.map(
					(t: { name: string }) => t.name
				);
				setTags(
					tagNames.filter((t: string) => t !== "favorites" && t !== "to-read")
				);
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
				url: props.metadata.url,
				title: props.metadata.title || undefined,
				favicon: props.metadata.favicon || undefined,
				ogImage: props.metadata.ogImage || undefined,
				ogDescription: props.metadata.ogDescription || undefined,
				siteName: props.metadata.siteName || undefined,
				tags: tags().length > 0 ? tags() : undefined,
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
		const bm = bookmark();
		if (!bm) return;
		try {
			const response = await sendMessage({
				type: "DELETE_BOOKMARK",
				id: bm.id,
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
		if (status() === "unbookmarked") {
			setSaving(true);
			try {
				const response = await sendMessage({
					type: "SAVE_BOOKMARK",
					url: props.metadata.url,
					title: props.metadata.title || undefined,
					favicon: props.metadata.favicon || undefined,
					ogImage: props.metadata.ogImage || undefined,
					ogDescription: props.metadata.ogDescription || undefined,
					siteName: props.metadata.siteName || undefined,
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

		const bm = bookmark();
		if (!bm) return;
		try {
			const response = await sendMessage({
				type: "TOGGLE_FAVORITE",
				id: bm.id,
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
		if (status() === "unbookmarked") {
			setSaving(true);
			try {
				const response = await sendMessage({
					type: "SAVE_BOOKMARK",
					url: props.metadata.url,
					title: props.metadata.title || undefined,
					favicon: props.metadata.favicon || undefined,
					ogImage: props.metadata.ogImage || undefined,
					ogDescription: props.metadata.ogDescription || undefined,
					siteName: props.metadata.siteName || undefined,
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

		const bm = bookmark();
		if (!bm) return;
		try {
			const response = await sendMessage({
				type: "TOGGLE_READ_LATER",
				id: bm.id,
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
		const bm = bookmark();
		if (bm) {
			const allTags = [
				...newTags,
				...(isFavorite() ? ["favorites"] : []),
				...(isToRead() ? ["to-read"] : []),
			];
			try {
				const response = await sendMessage({
					type: "UPDATE_BOOKMARK",
					id: bm.id,
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

	const isBookmarked = () => status() === "bookmarked";

	return (
		<Show
			when={status() !== "loading"}
			fallback={
				<section class="my-2 mb-3 rounded-xl border border-border bg-gradient-to-b from-secondary to-background p-4 dark:from-card dark:to-background">
					<div class="flex items-center justify-center py-3">
						<span class="text-xs text-muted-foreground">Checking...</span>
					</div>
				</section>
			}
		>
			<section class="my-2 mb-3 rounded-xl border border-border bg-gradient-to-b from-secondary to-background p-4 dark:from-card dark:to-background">
				{/* Page info */}
				<div class="mb-3 flex items-center gap-2.5">
					<Show when={props.metadata.favicon}>
						<img
							alt=""
							class="size-5 flex-shrink-0 rounded"
							height={20}
							onError={(e) => {
								(e.target as HTMLImageElement).style.display = "none";
							}}
							src={props.metadata.favicon ?? ""}
							width={20}
						/>
					</Show>
					<span class="line-clamp-2 flex-1 text-sm leading-snug font-medium text-foreground">
						{props.metadata.title || getDomain(props.metadata.url)}
					</span>
				</div>

				{/* Actions row */}
				<div class="flex items-center justify-between gap-2">
					<div class="flex gap-1.5">
						<button
							class={cn(
								"flex size-8 cursor-pointer items-center justify-center rounded-lg border bg-transparent transition-all hover:-translate-y-px",
								isFavorite()
									? "bg-favorite-bg text-favorite-text border-transparent"
									: "border-border text-muted-foreground hover:border-muted-foreground"
							)}
							onClick={handleToggleFavorite}
							title={
								isFavorite() ? "Remove from favorites" : "Add to favorites"
							}
							type="button"
						>
							<StarIcon filled={isFavorite()} />
						</button>
						<button
							class={cn(
								"flex size-8 cursor-pointer items-center justify-center rounded-lg border bg-transparent transition-all hover:-translate-y-px",
								isToRead()
									? "bg-read-later-bg text-read-later-text border-transparent"
									: "border-border text-muted-foreground hover:border-muted-foreground"
							)}
							onClick={handleToggleToRead}
							title={
								isToRead() ? "Remove from read later" : "Add to read later"
							}
							type="button"
						>
							<BookmarkIcon filled={isToRead()} />
						</button>
					</div>

					<Show
						when={isBookmarked()}
						fallback={
							<button
								class="cursor-pointer rounded-lg border-none bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-all hover:-translate-y-px hover:opacity-90 disabled:transform-none disabled:cursor-not-allowed disabled:opacity-60"
								disabled={saving()}
								onClick={handleBookmark}
								type="button"
							>
								{saving() ? "Saving..." : "Bookmark"}
							</button>
						}
					>
						<button
							class="cursor-pointer rounded-lg border border-border bg-secondary px-4 py-2 text-[13px] font-medium text-foreground transition-all hover:-translate-y-px hover:border-muted-foreground hover:bg-background"
							onClick={handleUnbookmark}
							type="button"
						>
							Bookmarked ✓
						</button>
					</Show>
				</div>

				{/* Tag input */}
				<Show when={isBookmarked()}>
					<TagInput
						excludeSystemTags
						onChange={handleTagsChange}
						tags={tags()}
					/>
				</Show>
			</section>
		</Show>
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

function TagInput(props: TagInputProps) {
	const [input, setInput] = createSignal("");
	const [suggestions, setSuggestions] = createSignal<ServerTag[]>([]);
	const [showSuggestions, setShowSuggestions] = createSignal(false);
	// oxlint-disable-next-line no-unassigned-vars -- assigned by Solid ref
	let inputRef!: HTMLInputElement;

	onMount(async () => {
		try {
			const response = await sendMessage({ type: "GET_USER_TAGS" });
			if (!isErrorResponse(response)) {
				setSuggestions(response.tags);
			}
		} catch (error) {
			console.error("[Gloss Popup] Error loading tags:", error);
		}
	});

	function handleInputChange(value: string) {
		setInput(value);
		setShowSuggestions(value.length > 0 || suggestions().length > 0);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === ",") {
			e.preventDefault();
			addTag(input().trim());
		} else if (
			e.key === "Backspace" &&
			input() === "" &&
			props.tags.length > 0
		) {
			props.onChange(props.tags.slice(0, -1));
		}
	}

	function addTag(tagName: string) {
		if (!tagName) return;
		const normalized = tagName.toLowerCase().trim();
		if (normalized && !props.tags.includes(normalized)) {
			props.onChange([...props.tags, normalized]);
		}
		setInput("");
		setShowSuggestions(false);
	}

	function removeTag(tagToRemove: string) {
		props.onChange(props.tags.filter((t) => t !== tagToRemove));
	}

	const filteredSuggestions = createMemo(() =>
		suggestions().filter(
			(s) =>
				!props.tags.includes(s.name) &&
				s.name.toLowerCase().includes(input().toLowerCase()) &&
				!(props.excludeSystemTags && SYSTEM_TAG_NAMES.includes(s.name))
		)
	);

	return (
		<div class="relative mt-2.5">
			<div class="flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-1.5 px-2">
				<For each={props.tags}>
					{(tag) => (
						<span class="bg-highlight inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-foreground">
							{tag}
							<button
								aria-label={`Remove ${tag}`}
								class="ml-0.5 cursor-pointer border-none bg-transparent p-0 text-xs leading-none text-muted-foreground opacity-70 hover:opacity-100"
								onClick={() => removeTag(tag)}
								type="button"
							>
								×
							</button>
						</span>
					)}
				</For>
				<input
					class="min-w-[60px] flex-1 border-none bg-transparent px-1 py-0.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
					onBlur={() => {
						setTimeout(() => setShowSuggestions(false), 150);
					}}
					onInput={(e) => handleInputChange(e.currentTarget.value)}
					onFocus={() =>
						setShowSuggestions(input().length > 0 || suggestions().length > 0)
					}
					onKeyDown={handleKeyDown}
					placeholder={props.tags.length === 0 ? "Add tags..." : ""}
					ref={inputRef}
					type="text"
					value={input()}
				/>
			</div>

			<Show when={showSuggestions() && filteredSuggestions().length > 0}>
				<div class="absolute top-full right-0 left-0 z-10 mt-1 max-h-[120px] overflow-y-auto rounded-md border border-border bg-background shadow-lg">
					<For each={filteredSuggestions().slice(0, 3)}>
						{(suggestion) => (
							<button
								class="block w-full cursor-pointer border-none bg-transparent px-3 py-2 text-left text-xs text-foreground transition-colors first:rounded-t-md last:rounded-b-md hover:bg-secondary"
								onClick={() => addTag(suggestion.name)}
								type="button"
							>
								{suggestion.name}
							</button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}

// =============================================================================
// DisabledSitesSection Component
// =============================================================================

const DISABLED_DOMAINS_KEY = "glossDisabledDomains";

function DisabledSitesSection() {
	const [domains, setDomains] = createSignal<string[]>([]);

	onMount(async () => {
		try {
			const result = await browser.storage.sync.get(DISABLED_DOMAINS_KEY);
			setDomains((result[DISABLED_DOMAINS_KEY] as string[]) || []);
		} catch {
			// ignore
		}
	});

	async function removeDomain(domain: string) {
		const updated = domains().filter((d) => d !== domain);
		setDomains(updated);
		await browser.storage.sync.set({ [DISABLED_DOMAINS_KEY]: updated });
	}

	return (
		<Show when={domains().length > 0}>
			<div class="mt-3">
				<p class="text-xs text-muted-foreground">Disabled sites</p>
				<ul class="mt-1.5 flex flex-col gap-1">
					<For each={domains()}>
						{(domain) => (
							<li class="flex items-center justify-between rounded-md bg-secondary px-2.5 py-1.5">
								<span class="text-xs text-foreground">{domain}</span>
								<button
									onClick={() => removeDomain(domain)}
									class="cursor-pointer border-none bg-transparent p-0 text-sm leading-none text-muted-foreground hover:text-destructive"
									title={`Re-enable Gloss on ${domain}`}
									type="button"
								>
									×
								</button>
							</li>
						)}
					</For>
				</ul>
				<p class="mt-1 text-[11px] text-muted-foreground/80">
					Reload the page after re-enabling
				</p>
			</div>
		</Show>
	);
}

// =============================================================================
// Inline Icon Components (Solid versions — no React dependency)
// =============================================================================

interface IconProps {
	class?: string;
	size?: number;
}

function SunIcon(props: IconProps) {
	return (
		<svg
			aria-hidden="true"
			class={props.class}
			fill="none"
			height={props.size ?? 16}
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="2"
			viewBox="0 0 24 24"
			width={props.size ?? 16}
		>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
		</svg>
	);
}

function MoonIcon(props: IconProps) {
	return (
		<svg
			aria-hidden="true"
			class={props.class}
			fill="none"
			height={props.size ?? 16}
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="2"
			viewBox="0 0 24 24"
			width={props.size ?? 16}
		>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
	);
}

function MonitorIcon(props: IconProps) {
	return (
		<svg
			aria-hidden="true"
			class={props.class}
			fill="none"
			height={props.size ?? 16}
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="2"
			viewBox="0 0 24 24"
			width={props.size ?? 16}
		>
			<rect height="14" rx="2" ry="2" width="20" x="2" y="3" />
			<line x1="8" x2="16" y1="21" y2="21" />
			<line x1="12" x2="12" y1="17" y2="21" />
		</svg>
	);
}

function StarIcon(props: IconProps & { filled?: boolean }) {
	return (
		<svg
			aria-hidden="true"
			class={props.class}
			fill={props.filled ? "currentColor" : "none"}
			height={props.size ?? 16}
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="2"
			viewBox="0 0 24 24"
			width={props.size ?? 16}
		>
			<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
		</svg>
	);
}

function BookmarkIcon(props: IconProps & { filled?: boolean }) {
	return (
		<svg
			aria-hidden="true"
			class={props.class}
			fill={props.filled ? "currentColor" : "none"}
			height={props.size ?? 16}
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="2"
			viewBox="0 0 24 24"
			width={props.size ?? 16}
		>
			<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
		</svg>
	);
}

function Logo(props: { class?: string }) {
	return (
		<svg
			class={props.class}
			fill="none"
			role="img"
			viewBox="0 0 839 360"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Gloss</title>
			<text
				fill="currentColor"
				font-family="Satoshi"
				font-size="236.983"
				font-weight="bold"
				letter-spacing="-0.02em"
				{...({ "xml:space": "preserve" } as Record<string, string>)}
			>
				<tspan x="146" y="291.239">
					Gloss
				</tspan>
			</text>
			<path d="M87 40L87 312" stroke="currentColor" stroke-width="20" />
		</svg>
	);
}

interface ButtonProps {
	children: import("solid-js").JSX.Element;
	onClick?: () => void;
	variant?: "primary" | "link";
	disabled?: boolean;
}

function Button(props: ButtonProps) {
	return (
		<button
			class={cn(
				"inline-flex items-center justify-center font-medium transition-all duration-150",
				"disabled:transform-none disabled:cursor-not-allowed disabled:opacity-60",
				props.variant === "primary" &&
					"rounded-lg bg-primary px-4 py-2 text-[13px] text-primary-foreground hover:opacity-90 active:opacity-80",
				props.variant === "link" &&
					"bg-transparent p-0 text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
			)}
			onClick={props.onClick}
			disabled={props.disabled}
			type="button"
		>
			{props.children}
		</button>
	);
}

// =============================================================================
// Utility Functions
// =============================================================================

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
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

	if (diffSeconds < 60) return "just now";
	if (diffMinutes < 60) return `${diffMinutes}m`;
	if (diffHours < 24) return `${diffHours}h`;
	if (diffDays < 30) return `${diffDays}d`;

	return date.toLocaleDateString();
}

export default App;
