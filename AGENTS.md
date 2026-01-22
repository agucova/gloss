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

### Database (Drizzle + PostgreSQL)
```bash
bun run db:push          # Push schema changes to database
bun run db:generate      # Generate migration files
bun run db:migrate       # Run migrations
bun run db:studio        # Open Drizzle Studio UI
```

### Code Quality
```bash
bun x ultracite fix      # Format and auto-fix lint issues
bun x ultracite check    # Check for issues without fixing
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
- **Environment**: Validated via Zod schemas in `packages/env/` - server vars in `server.ts`, client (VITE_) vars in `web.ts`
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

### Server (`apps/server/.env`)
```
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=<min 32 chars>
BETTER_AUTH_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001
NODE_ENV=development
```

### Web (`apps/web/.env`)
```
VITE_SERVER_URL=http://localhost:3000
```

---

## Code Standards

This project uses **Ultracite** (Biome) for formatting and linting. Most issues are auto-fixable with `bun x ultracite fix`.

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
- Tailwind class sorting (via `cn`, `clsx`, `cva` functions)
- Lefthook runs Biome on pre-commit
