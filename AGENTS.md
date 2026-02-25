# AGENTS.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Project Overview

Gloss is a browser extension + web app for highlighting text on web pages and sharing those highlights with friends (a spiritual successor to Curius). Users install the extension, highlight text while browsing, and see their friends' highlights overlaid on pages they visit.

## Commands

### Development

```bash
bun run dev              # Start all apps (web on :3001, server on :3000)
bun run dev:web          # Web app only
bun run dev:server       # API server only
```

### First-time Setup

```bash
bun run db:setup         # Create required PostgreSQL extensions (pgvector)
bun run db:push          # Push schema to database
bun run db:seed          # Optional: seed test data
```

Or use `bun run db:init` to run setup + push together.

### Database (Drizzle + PostgreSQL)

```bash
bun run db:push          # Push schema changes to database
bun run db:generate      # Generate migration files
bun run db:migrate       # Run migrations
bun run db:studio        # Open Drizzle Studio UI
bun run db:backfill      # Populate search index embeddings (requires OPENAI_API_KEY)
```

### Code Quality

```bash
bun run lint             # Lint with oxlint
bun run format           # Format with oxfmt
bun run lint:fix         # Auto-fix lint issues + format
bun run format:check     # Check formatting without writing
bun run check-types      # TypeScript type checking across all packages
```

### Browser Extension (WXT)

```bash
cd apps/extension
bun run dev              # Dev mode with hot reload (port 5555)
bun run build            # Build for Chrome
bun run build:firefox    # Build for Firefox
bun run zip              # Package extension as ZIP
```

## Architecture

### Monorepo Structure (Turborepo + Bun workspaces)

```
apps/
  web/          # React SPA (Vite + TanStack Router) - port 3001
  server/       # Elysia API server - port 3000
  extension/    # Browser extension (WXT)

packages/
  api/          # Shared API types and utilities
  auth/         # Better-Auth configuration
  curius/       # Curius API client (reverse-engineered API for highlight import)
  db/           # Drizzle schema and database connection
  env/          # Environment variable validation (@t3-oss/env-core)
  config/       # Shared TypeScript config
```

### Data Flow

1. **Web/Extension → Server**: Eden Treaty client (`@elysiajs/eden`) for end-to-end type-safe API calls
2. **Authentication**: Better-Auth handles `/api/auth/*`, stores sessions in PostgreSQL
3. **Database**: Drizzle ORM with PostgreSQL, schema in `packages/db/src/schema/`

### Key Type-Safety Patterns

- **Eden Treaty**: Server exports `App` type from `apps/server/src/index.ts`, clients import it for full type inference
- **Environment**: Validated via Zod schemas in `packages/env/` - server vars in `server.ts`, client (VITE\_) vars in `web.ts`
- **Auth**: Session derived via `.derive()` middleware, available as `session` in route handlers

### Adding API Routes

Define routes in `apps/server/src/routes/` using Elysia:

```typescript
export const myRoutes = new Elysia({ prefix: "/my-prefix" })
  .derive(async ({ request }) => {
    // Derive session or other context
    const session = await auth.api.getSession({ headers: request.headers });
    return { session };
  })
  .get("/endpoint", ({ session, set }) => {
    if (!session) { set.status = 401; return { error: "Auth required" }; }
    return { data: "..." };
  })
  .post("/endpoint", ({ body, session }) => { ... }, {
    body: t.Object({ field: t.String() })  // Validation with Elysia's t
  });
```

Then mount in `apps/server/src/index.ts` with `.use(myRoutes)`.

### Adding Database Tables

1. Create schema in `packages/db/src/schema/`
2. Export from `packages/db/src/schema/index.ts`
3. Run `bun run db:push` (dev) or `bun run db:generate && bun run db:migrate` (prod)

## Environment Variables

All env vars live in a single `.env` file at the repo root (see `.env.example`).

### Development (`.env`)

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/gloss
BETTER_AUTH_SECRET=<min 32 chars>
BETTER_AUTH_URL=http://localhost:3000
VITE_SERVER_URL=http://localhost:3000
VITE_WEB_URL=http://localhost:3001
NODE_ENV=development
```

### Production (`.env.production`)

Used for `:prod` script variants (e.g., `db:push:prod`, `db:studio:prod`).

```
DATABASE_URL=postgresql://...
BETTER_AUTH_URL=https://api.gloss.agus.sh
VITE_SERVER_URL=https://api.gloss.agus.sh
VITE_WEB_URL=https://gloss.agus.sh
NODE_ENV=production
```

---

## Code Standards

This project uses **oxlint** for linting and **oxfmt** for formatting (both from the OXC project). Most lint issues are auto-fixable with `bun run lint:fix`.

### React & JSX

- Use function components, call hooks at the top level only
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles
- **React 19+**: Use ref as a prop instead of `React.forwardRef`

### Async & Promises

- Always `await` promises - don't forget to use the return value
- Use `async/await` syntax instead of promise chains
- Handle errors appropriately with try-catch blocks

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input (especially in content scripts)

### Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code

### Formatting

- Tab indentation, double quotes
- Tailwind class sorting (via `cn`, `clsx`, `cva` functions) — built into oxfmt
- Import sorting — built into oxfmt
- Lefthook runs oxfmt + oxlint on pre-commit

---

## Design Context

### Users

Knowledge workers—researchers, writers, analysts—who highlight text for retention and reference. They're browsing the web with intention, often reading long-form content, and want to capture what resonates. The interface should feel like a tool that respects their focus and gets out of the way.

### Brand Personality

**Minimal, calm, focused.** Gloss should feel like a quiet companion rather than an attention-seeking app. The interface recedes when not needed and surfaces information without friction. Think library, not social feed.

### Aesthetic Direction

- **Primary reference**: Are.na / Cosmos—gallery-like presentation, artistic sensibility, community without noise
- **Visual tone**: Understated, spacious, considered. Every element earns its place.
- **Typography**: Clean sans-serif (Inter), generous line-height, restrained hierarchy
- **Color**: Neutral base with warm pastel highlights (soft yellows, peaches, pinks) for user highlights; distinct but harmonious tones for friends' highlights
- **Theme**: Both light and dark modes, respecting system preference with manual toggle
- **Density**: Spacious—generous whitespace, breathing room, one thing at a time

### Anti-References (What to Avoid)

- **Corporate SaaS**: No gradient CTAs, generic dashboards, or startup-y enthusiasm
- **Social media**: No feed-like density, engagement metrics, or notification pressure
- **Academic/utilitarian**: No dry, unstyled, purely functional interfaces
- **Overly whimsical**: No mascots, excessive illustrations, or forced playfulness

### Design Principles

1. **Invisible until needed** — The best interface is one you forget is there. Highlights should feel native to the page, not overlaid. Controls appear contextually.

2. **Content is the hero** — Highlighted text and the pages it lives on matter most. UI chrome should be minimal; let the words breathe.

3. **Warmth through restraint** — Friendliness comes from thoughtful spacing and soft highlight colors, not from visual busyness or emoji.

4. **Respect the reader's context** — Users are mid-thought when highlighting. Interactions should be fast, quiet, and non-disruptive.

5. **Gallery over feed** — When displaying highlights, prefer considered curation (cards, collections) over infinite scroll. Quality of attention over quantity.
