# Backlog

## P2 — Missing Features / Polish

### CLI package untested

`packages/cli/` is fully implemented (commands, MCP server, OAuth flow) but has never been run. Needs end-to-end testing: build with tsup, verify bin entries work, test each command against the API, test MCP server startup. Likely will surface dependency or build issues.

### Library route naming consistency

Old `/bookshelf` route was deleted and replaced with `/library`. Verify all internal links, navigation, and redirects reference `/library` and not the old path.

### Bookshelf search should degrade gracefully without semantic search

When the OpenAI API key isn't configured or pgvector is unavailable, the bookshelf search UI (`apps/web/src/components/bookshelf/bookshelf-results.tsx`) should indicate that only text search is available rather than silently falling back.

### Backfill script for search index

`packages/db/src/backfill-search-index.ts` exists but isn't wired into any `package.json` script. Add a `db:backfill` script and document when to run it (after setting `OPENAI_API_KEY` and populating data).

## P3 — Code Quality

### Floating UI cleanup ordering inconsistency

`annotation-controller.ts:113-129` runs `cleanupPositioning()` before `anchorManager.clear()`, but `margin-annotations.ts` removes DOM elements without clearing anchors first. Should standardize cleanup order across both code paths.

### Comment indicator disconnected from highlights

`comment-indicator.ts:42-43` uses fixed position `top: 16px; right: 16px`, independent of highlight positions. Shows a comment count even when no annotations can actually anchor. Consider hiding when all annotations are orphaned.

### No IntersectionObserver for margin annotations

Hover pill uses `IntersectionObserver` to hide when its highlight leaves the viewport, but margin annotations don't. Margin annotations stay visible even when their highlight scrolls off-screen. The Floating UI `hide()` middleware partially handles this, but only if `computePosition()` succeeds.

### Expanded annotation uses manual fixed positioning

`margin-annotations.ts:787-794` positions the expanded annotation with inline `position: fixed` styles instead of Floating UI. No repositioning on scroll — the expanded view stays put while the user scrolls away from the highlight.

### Missing null checks in margin-annotations

Lines ~641, 651 in `margin-annotations.ts` assume `firstComment` exists without validation. Could throw on highlights that have no comments.
