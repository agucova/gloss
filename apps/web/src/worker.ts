/// <reference types="@cloudflare/workers-types" />

// Cloudflare Worker entrypoint. With `main` set alongside `[assets]`,
// Cloudflare's default routing serves matching static files first and only
// invokes this handler for unmatched paths. We forward those to the assets
// binding so `not_found_handling = "single-page-application"` triggers the
// index.html fallback for client-side routes.
// Docs: https://developers.cloudflare.com/workers/static-assets/binding/

interface Env {
	ASSETS: Fetcher;
}

export default {
	fetch(request, env) {
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
