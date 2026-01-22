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
  api/          # tRPC router definitions and procedures
  auth/         # Better-Auth configuration
  db/           # Drizzle schema and database connection
  env/          # Environment variable validation (@t3-oss/env-core)
  config/       # Shared TypeScript config
```

### Data Flow
1. **Web/Extension → Server**: tRPC client (`@trpc/client`) calls to `/trpc/*` endpoint
2. **Authentication**: Better-Auth handles `/api/auth/*`, stores sessions in PostgreSQL
3. **Database**: Drizzle ORM with PostgreSQL, schema in `packages/db/src/schema/`

### Key Type-Safety Patterns
- **tRPC**: `AppRouter` type exported from `packages/api/src/routers/index.ts` enables end-to-end type inference
- **Environment**: Validated via Zod schemas in `packages/env/` - server vars in `server.ts`, client (VITE_) vars in `web.ts`
- **Auth context**: `createContext()` in `packages/api/src/context.ts` extracts session from request headers

### Adding tRPC Procedures
Define in `packages/api/src/routers/index.ts`:
- `publicProcedure` - no auth required
- `protectedProcedure` - requires valid session, provides `ctx.session.user`

### Adding Database Tables
1. Create schema in `packages/db/src/schema/`
2. Export from `packages/db/src/schema/index.ts`
3. Run `bun run db:push` (dev) or `bun run db:generate && bun run db:migrate` (prod)

## Environment Variables

### Server (`apps/server/.env`)
```
DATABASE_URL=postgresql://...
DATABASE_HOST, DATABASE_USERNAME, DATABASE_PASSWORD
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
