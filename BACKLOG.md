# Backlog

## P1 — Blockers for trying the app

### Convex backend has no env vars set

`bunx convex env list` against the dev deployment (`glorious-toad-644`) returns empty. Hitting `/.well-known/openid-configuration` returns `BetterAuthError: You are using the default secret.` Nothing will authenticate until these are set:

```bash
bunx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
bunx convex env set SITE_URL http://localhost:3001
```

Plus OAuth/Resend creds if needed (see README). Same vars need to be set on prod.

### Database is empty

All Convex tables exist but contain zero rows. Run `bun run convex:seed` before trying the UI.

## P2 — Known gaps

### CLI package untested end-to-end

`packages/cli/` is fully implemented (commands, MCP server, OAuth/PKCE flow against `convex/http.ts`) but has never been run. Needs: `bun run --cwd packages/cli build`, verify both bin entries (`gloss`, `gloss-mcp`), walk the `gloss auth login` → browser-callback → API-key → `gloss search` path against a seeded deployment, test MCP startup under a real client. Likely will surface bundling or dependency issues first.

### `apps/web/src/components/bookshelf/` directory name is stale

The `/bookshelf` route was renamed to `/library` but the component folder that backs it is still called `bookshelf/` (`bookshelf-results.tsx`, `bookshelf-page.tsx`, `index.ts`). Route navigation is already correct; this is purely cosmetic naming drift.

### `VITE_SERVER_URL` is dead weight

`apps/web/src/lib/env.ts` throws if `VITE_SERVER_URL` isn't set, but nothing in the codebase actually reads it anymore (post-Convex). Either delete `env.ts` or drop the validation so builds don't require a no-op var.

## P3 — Code quality (needs re-verification)

The content-script UI was rewritten from Lit to Solid.js in `4ccbbe4`. `annotation-controller.ts` no longer exists, `margin-annotations` went from ~800 lines to ~140, and positioning is now handled by a custom `useFloating` hook (`apps/extension/content-ui/use-floating.ts`). The original concerns below were filed against the Lit code — before re-adding them, re-verify against the Solid implementation:

- **Margin annotations hiding when the highlight leaves the viewport.** `IntersectionObserver` hookup needs checking in `annotation-item.tsx` (current margin annotations component) against the Lit version's behavior.
- **Expanded annotation / comment-panel positioning on scroll.** `comment-panel.tsx` uses `useFloating`, but verify it repositions (or dismisses) on scroll rather than staying fixed.
- **Comment indicator presence when no highlights anchor.** `comment-indicator.tsx` (351 lines, rewritten) — the old concern was a fixed `top:16px;right:16px` badge that showed even when all annotations were orphaned. Confirm the Solid version conditions on `manager()` having active anchors.
- **Cleanup ordering between positioning + anchor manager.** Solid's `onCleanup` replaces the old manual teardown paths; verify both mount/unmount paths converge through the same cleanup.

## Moot (closed by the Convex migration)

Kept here for audit only — do not reopen without rethinking.

- ~~Bookshelf search graceful-degrade when OpenAI/pgvector is unavailable~~ — pgvector and the OpenAI embedding pipeline are gone. Search now uses Convex `searchIndex` (`convex/schema.ts` → `searchContent` field on highlights/bookmarks/comments).
- ~~Backfill script for search-index embeddings~~ — `packages/db` no longer exists; `searchContent` is populated inline at write time.
- ~~`/bookshelf` → `/library` route rename~~ — done (`apps/web/src/routes/library.tsx`).
