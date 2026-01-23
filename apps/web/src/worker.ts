// Cloudflare Worker for serving static assets
// The static assets are handled automatically via the [assets] binding in wrangler.toml
// This worker can be extended to add custom headers, redirects, or other edge logic

export default {
	fetch(): Response {
		// Static assets are served automatically by the assets binding
		// This handler is only reached if no static file matches
		// With not_found_handling = "single-page-application", this shouldn't be called
		// But we return a fallback just in case
		return new Response("Not Found", { status: 404 });
	},
};
