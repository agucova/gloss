# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy root package files
COPY package.json bun.lock ./
COPY turbo.json ./

# Copy workspace package.json files for dependency resolution
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/extension/package.json ./apps/extension/
COPY packages/anchoring/package.json ./packages/anchoring/
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/curius/package.json ./packages/curius/
COPY packages/dashboard/package.json ./packages/dashboard/
COPY packages/db/package.json ./packages/db/
COPY packages/env/package.json ./packages/env/
COPY packages/fonts/package.json ./packages/fonts/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY apps/server ./apps/server
COPY packages ./packages
COPY tsconfig.json ./

# Build the server (bundles @gloss/* workspace packages)
WORKDIR /app/apps/server
RUN bun run build

# Production stage
FROM oven/bun:1-slim AS runner

WORKDIR /app

# Copy the entire node_modules and built output from builder
# (needed because external deps like pg, drizzle-orm aren't bundled)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]
