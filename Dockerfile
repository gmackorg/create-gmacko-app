# syntax=docker/dockerfile:1

# ============================================
# Base image with pnpm
# ============================================
FROM node:22-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat

WORKDIR /app

# ============================================
# Builder stage - install workspace + build the app
# ============================================
FROM base AS builder

WORKDIR /app

# Copy the entire workspace so pnpm can resolve every package. A hand-maintained
# list of per-package `COPY package.json` lines drifts as packages are added
# (this build was red because i18n/logging/telemetry were missing), and the old
# `COPY packages/*/node_modules ./packages/` flattened per-package node_modules
# (breaking validators' zod / @gmacko/tsconfig resolution). Copy-all + install
# is simpler and correct.
COPY . .

# Install WITH devDependencies — the build needs tsc/tsup/next/etc. NODE_ENV is
# intentionally left unset here so pnpm keeps devDependencies; it is set to
# production only for the build step below.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Build arguments
ARG DATABASE_URL
ARG AUTH_SECRET
ARG SKIP_ENV_VALIDATION=true
ARG DOCKER_BUILD=true

# Set environment for build. DATABASE_URL is a placeholder so @gmacko/legacy-db/client
# (which throws at import if unset) can instantiate during `next build` page-data
# collection — postgres-js connects lazily, so no DB is contacted at build time.
ENV DATABASE_URL=${DATABASE_URL}
ENV AUTH_SECRET=${AUTH_SECRET}
ENV SKIP_ENV_VALIDATION=${SKIP_ENV_VALIDATION}
ENV DOCKER_BUILD=${DOCKER_BUILD}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application
RUN pnpm turbo run build --filter=@gmacko/nextjs

# ============================================
# Runner stage - production image
# ============================================
FROM node:22-alpine AS runner

WORKDIR /app

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/nextjs/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/nextjs/.next/static ./apps/nextjs/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/nextjs/public ./apps/nextjs/public

USER nextjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the server
CMD ["node", "apps/nextjs/server.js"]
