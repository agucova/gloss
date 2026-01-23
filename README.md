# gloss

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Elysia, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Elysia** - Type-safe, high-performance framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Biome** - Linting and formatting
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

### Local development

```bash
devenv up
```

Then copy `.env.example` to `.env` at the repo root and configure your database:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gloss
```

Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## Git Hooks and Formatting

- Format and lint fix: `bun run check`

## Project Structure

```
gloss/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Elysia, TRPC)
├── packages/
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:studio`: Open database studio UI
- `bun run check`: Run Biome formatting and linting

## Deployment

### Runway Postgres (Database)

1. **Create a Postgres service** in Runway.
2. **Copy the `DATABASE_URL`** provided by Runway.

### Runway (API Server)

1. **Create a new project** in Runway.

2. **Deploy the API server**:
   - Connect this repository
   - Runway will detect `railway.toml` and use the Dockerfile

3. **Set environment variables** in Runway dashboard:
   ```
   DATABASE_URL=<your-runway-postgres-url>
   BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
   BETTER_AUTH_URL=https://your-api.example.com
   VITE_WEB_URL=https://your-web-app.example.com
   NODE_ENV=production
   ```
   Note: `PORT` is injected automatically by Runway.

4. **Run database migrations** (first deploy):
   ```bash
   # Locally with production DATABASE_URL
   DATABASE_URL=<runway-url> bun run db:push
   ```

### Cloudflare Pages (Web App)

1. **Connect your repository** on [Cloudflare Pages](https://pages.cloudflare.com)

2. **Configure build settings**:
   - **Framework preset**: None
   - **Build command**: `bun install && bun run build --filter=web`
   - **Build output directory**: `apps/web/dist`
   - **Root directory**: `/` (leave empty)

3. **Set environment variables**:
   ```
   VITE_SERVER_URL=https://your-api.example.com
   ```

4. **Deploy** - Cloudflare will build and deploy automatically on push

### Alternative: Runway for Web App

If you prefer to keep everything on Runway:

1. Create a second service in your Runway project
2. Use these settings:
   - **Build command**: `bun install && cd apps/web && bun run build`
   - **Start command**: `bunx serve apps/web/dist -l 3001`
   - **Watch paths**: `apps/web/**`, `packages/**`

### Production Checklist

- [ ] Create a Runway Postgres service and copy `DATABASE_URL`
- [ ] Create "Default role" and save credentials (shown only once!)
- [ ] Use connection string with `sslmode=verify-full` and port `6432` (PgBouncer)
- [ ] Generate a secure `BETTER_AUTH_SECRET`: `openssl rand -base64 32`
- [ ] Set `VITE_WEB_URL` to your web app's production URL (e.g., `https://gloss.pages.dev`)
- [ ] Set `BETTER_AUTH_URL` to your API's production URL (e.g., `https://gloss-api.example.com`)
- [ ] Run `DATABASE_URL=<url> bun run db:push` to create tables
- [ ] Test authentication flow end-to-end
