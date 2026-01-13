# Project Context Skill

Use this skill to understand the create-gmacko-app template structure.

## Architecture Overview

This is a T3 Turbo monorepo fork with:

- **Apps**: Next.js, Expo, TanStack Start
- **Core Packages**: api, auth, db, ui, validators, config
- **Integration Packages**: analytics, monitoring, payments, email, realtime, storage

## Key Files

### Configuration

- `packages/config/src/integrations.ts` - Single source of truth for enabled integrations
- `gmacko.integrations.json` - Scaffold-time manifest (read-only reference)
- `.env.example` - Environment variables documentation

### Database

- `packages/db/src/client.ts` - Neon Postgres connection via drizzle-orm
- `packages/db/src/schema.ts` - Drizzle schema definitions
- `packages/db/drizzle.config.ts` - Drizzle migration config

### Authentication

- `packages/auth/src/index.ts` - better-auth configuration
- `apps/nextjs/src/app/api/auth/[...all]/route.ts` - Auth API handler
- `apps/expo/src/utils/auth.ts` - Expo auth client

### API

- `packages/api/src/root.ts` - tRPC router
- `packages/api/src/trpc.ts` - tRPC context with auth + db

### Providers (Conditional)

- `apps/nextjs/src/app/providers.tsx` - Web provider wiring
- `apps/expo/src/providers.tsx` - Native provider wiring

## Integration Toggle Pattern

All integrations follow this pattern:

1. Check `integrations.<name>` from `@gmacko/config`
2. If disabled: no initialization, no env vars required, no runtime code
3. If enabled: wrap with provider, require env vars

Example:

```typescript
import { integrations } from "@gmacko/config";

if (integrations.posthog) {
  // Initialize PostHog
}
```

## Common Tasks

### Adding a new feature

1. Check if it belongs in an existing package or needs a new one
2. If integration-specific, follow the toggle pattern
3. Update env.ts with any new env vars (optional if integration can be disabled)
4. Run `pnpm -w typecheck` to verify

### Modifying database schema

1. Edit `packages/db/src/schema.ts`
2. Run `pnpm db:generate` to generate migration
3. Run `pnpm db:push` to apply to database

### Adding a new API endpoint

1. Create router in `packages/api/src/router/`
2. Add to `packages/api/src/root.ts`
3. Use in app via tRPC client
