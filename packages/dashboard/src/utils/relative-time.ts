/**
 * Format a date as a relative time string.
 * Returns strings like "just now", "5 minutes ago", "2 hours ago", "3 days ago".
 */
export function formatRelativeTime(date: Date | string): string {
	const now = new Date();
	const then = new Date(date);
	const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

	if (seconds < 60) {
		return "just now";
	}

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
	}

	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
	}

	const days = Math.floor(hours / 24);
	if (days < 7) {
		return days === 1 ? "1 day ago" : `${days} days ago`;
	}

	const weeks = Math.floor(days / 7);
	if (weeks < 4) {
		return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
	}

	return then.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: now.getFullYear() !== then.getFullYear() ? "numeric" : undefined,
	});
}
