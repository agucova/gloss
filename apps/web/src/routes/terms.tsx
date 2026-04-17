import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

import termsMarkdown from "../../../../docs/legal/terms-of-service.md?raw";

export const Route = createFileRoute("/terms")({
	component: TermsRoute,
	head: () => ({
		meta: [
			{ title: "Terms — Gloss" },
			{
				name: "description",
				content:
					"The terms that govern your use of the Gloss browser extension, website, and CLI.",
			},
		],
	}),
});

const BODY = termsMarkdown.replace(/^#\s+.*\n+/, "");

function TermsRoute() {
	return (
		<LegalPage
			eyebrow="Terms"
			title="Terms of Service"
			lead="The terms that govern your use of the Gloss browser extension, website, and CLI."
			content={BODY}
		/>
	);
}
