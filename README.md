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

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

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

### PlanetScale Postgres (Database)

1. **Create a database** on [PlanetScale](https://planetscale.com)
   - Select **"Postgres"** as the database engine
   - Choose a region close to your Railway deployment

2. **Create credentials**:
   - Click **"Connect"** → **"Default role"** → **"Create default role"**
   - Record the Host, Username, and Password (shown only once!)

3. **Get connection string**:
   - Under "How are you connecting?" select **"Node.js"** or **"General"**
   - Use port `6432` for PgBouncer (recommended for connection pooling)
   - Format: `postgresql://{user}:{pass}@{host}:6432/postgres?sslmode=verify-full`

   > **Note**: The "Default role" is for admin purposes. For production, [create a separate role](https://planetscale.com/docs/postgres/connecting/roles) with limited privileges for your application.

### Railway (API Server)

1. **Create a new project** on [Railway](https://railway.app)

2. **Deploy the API server**:
   - Click "New" → "GitHub Repo" → select this repository
   - Railway will detect `railway.toml` and use the Dockerfile

3. **Set environment variables** in Railway dashboard:
   ```
   DATABASE_URL=<your-planetscale-postgres-url>
   BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
   BETTER_AUTH_URL=https://your-app.up.railway.app
   CORS_ORIGIN=https://your-web-app.pages.dev
   NODE_ENV=production
   ```
   Note: `PORT` is injected automatically by Railway.

4. **Run database migrations** (first deploy):
   ```bash
   # Locally with production DATABASE_URL
   DATABASE_URL=<planetscale-url> bun run db:push
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
   VITE_SERVER_URL=https://your-api.up.railway.app
   ```

4. **Deploy** - Cloudflare will build and deploy automatically on push

### Alternative: Railway for Web App

If you prefer to keep everything on Railway:

1. Create a second service in your Railway project
2. Use these settings:
   - **Build command**: `bun install && cd apps/web && bun run build`
   - **Start command**: `bunx serve apps/web/dist -l 3001`
   - **Watch paths**: `apps/web/**`, `packages/**`

### Production Checklist

- [ ] Create PlanetScale Postgres database (select "Postgres" engine)
- [ ] Create "Default role" and save credentials (shown only once!)
- [ ] Use connection string with `sslmode=verify-full` and port `6432` (PgBouncer)
- [ ] Generate a secure `BETTER_AUTH_SECRET`: `openssl rand -base64 32`
- [ ] Set `CORS_ORIGIN` to your web app's production URL (e.g., `https://gloss.pages.dev`)
- [ ] Set `BETTER_AUTH_URL` to your API's production URL (e.g., `https://gloss-api.up.railway.app`)
- [ ] Run `DATABASE_URL=<url> bun run db:push` to create tables
- [ ] Create a [separate PlanetScale role](https://planetscale.com/docs/postgres/connecting/roles) with limited privileges for production
- [ ] Test authentication flow end-to-end
