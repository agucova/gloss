import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

// Canonical source lives under docs/legal/ at the repo root; Vite inlines the
// raw markdown at build time via the `?raw` query.
import privacyMarkdown from "../../../../docs/legal/privacy-policy.md?raw";

export const Route = createFileRoute("/privacy")({
	component: PrivacyRoute,
	head: () => ({
		meta: [
			{ title: "Privacy — Gloss" },
			{
				name: "description",
				content:
					"How Gloss collects, uses, and protects the data you create while highlighting webpages.",
			},
		],
	}),
});

const BODY = privacyMarkdown.replace(/^#\s+.*\n+/, "");

function PrivacyRoute() {
	return (
		<LegalPage
			eyebrow="Privacy"
			title="Privacy Policy"
			lead="How Gloss collects, uses, and protects the data you create while highlighting webpages."
			content={BODY}
		/>
	);
}
