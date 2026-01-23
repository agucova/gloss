import { useEffect, useState } from "react";
import {
	isErrorResponse,
	type ServerHighlight,
	sendMessage,
} from "../../utils/messages";

import "./style.css";

interface AuthState {
	authenticated: boolean;
	user?: { id: string; name: string | null };
}

function App() {
	const [authState, setAuthState] = useState<AuthState | null>(null);
	const [highlights, setHighlights] = useState<ServerHighlight[]>([]);
	const [loading, setLoading] = useState(true);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [serverUrl, setServerUrl] = useState("");

	// Load initial data on mount
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run once on mount
	useEffect(() => {
		loadData();
		loadSettings();
	}, []);

	async function loadData() {
		setLoading(true);
		try {
			// Get auth status
			const authResponse = await sendMessage({ type: "GET_AUTH_STATUS" });
			setAuthState(authResponse);

			// Get recent highlights if authenticated
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
		const stored = await browser.storage.sync.get("serverUrl");
		const url = stored.serverUrl;
		setServerUrl(typeof url === "string" ? url : "");
	}

	async function saveServerUrl(url: string) {
		setServerUrl(url);
		if (url.trim()) {
			await browser.storage.sync.set({ serverUrl: url.trim() });
		} else {
			await browser.storage.sync.remove("serverUrl");
		}
	}

	function handleSignIn() {
		const baseUrl =
			serverUrl || import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
		browser.tabs.create({ url: `${baseUrl}/login` });
	}

	async function handleSignOut() {
		try {
			const baseUrl =
				serverUrl || import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
			await fetch(`${baseUrl}/api/auth/sign-out`, {
				method: "POST",
				credentials: "include",
			});
			setAuthState({ authenticated: false });
			setHighlights([]);
		} catch (error) {
			console.error("[Gloss Popup] Error signing out:", error);
		}
	}

	function openHighlight(url: string) {
		browser.tabs.create({ url });
	}

	if (loading) {
		return (
			<div className="popup">
				<header className="popup-header">
					<h1 className="popup-title">Gloss</h1>
				</header>
				<main className="popup-content">
					<p className="text-muted">Loading...</p>
				</main>
			</div>
		);
	}

	return (
		<div className="popup">
			<header className="popup-header">
				<h1 className="popup-title">Gloss</h1>
			</header>

			<main className="popup-content">
				{/* Auth Section */}
				<section className="section">
					{authState?.authenticated ? (
						<div className="auth-status">
							<div className="user-info">
								<span className="user-dot" />
								<span className="user-name">
									Signed in as {authState.user?.name || "User"}
								</span>
							</div>
							<button
								className="link-btn"
								onClick={handleSignOut}
								type="button"
							>
								Sign out
							</button>
						</div>
					) : (
						<div className="auth-prompt">
							<p className="text-muted">Sign in to save your highlights</p>
							<button
								className="btn btn-primary"
								onClick={handleSignIn}
								type="button"
							>
								Sign in
							</button>
						</div>
					)}
				</section>

				{/* Recent Highlights */}
				{authState?.authenticated && (
					<section className="section">
						<h2 className="section-title">Recent highlights</h2>
						{highlights.length > 0 ? (
							<ul className="highlight-list">
								{highlights.map((highlight) => (
									<li key={highlight.id}>
										<button
											className="highlight-item"
											onClick={() => openHighlight(highlight.url)}
											type="button"
										>
											<span className="highlight-text">
												"{truncate(highlight.text, 80)}"
											</span>
											<span className="highlight-meta">
												{getDomain(highlight.url)} ·{" "}
												{formatRelativeTime(highlight.createdAt)}
											</span>
										</button>
									</li>
								))}
							</ul>
						) : (
							<p className="text-muted">No highlights yet</p>
						)}
					</section>
				)}

				{/* Settings */}
				<section className="section">
					<button
						className="section-toggle"
						onClick={() => setSettingsOpen(!settingsOpen)}
						type="button"
					>
						<span className="section-title">Settings</span>
						<span className="toggle-icon">{settingsOpen ? "−" : "+"}</span>
					</button>

					{settingsOpen && (
						<div className="settings-content">
							<label className="input-label" htmlFor="serverUrl">
								Server URL
							</label>
							<input
								className="input"
								id="serverUrl"
								onChange={(e) => saveServerUrl(e.target.value)}
								placeholder="https://gloss.example.com"
								type="url"
								value={serverUrl}
							/>
							<p className="input-hint">
								Leave blank to use the default server
							</p>
						</div>
					)}
				</section>
			</main>
		</div>
	);
}

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
