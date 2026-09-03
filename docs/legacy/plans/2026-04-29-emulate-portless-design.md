# Emulate + Portless Integration Design

**Date:** 2026-04-29
**Status:** Approved

## Problem

Local development requires Docker Desktop for Postgres and Redis, real OAuth app registrations for auth testing, and manual port management. This adds friction, slows onboarding, and couples dev to production services.

## Solution

Replace the Docker-based dev stack with three tools:

1. **emulate** (forked to add postgres + redis) — emulates all external services locally
2. **portless** — gives the app itself a stable HTTPS `.localhost` URL
3. **Magic links with bypass** — instant login in dev/pre-launch without real OAuth apps

## Architecture

### Emulate Fork (`/Volumes/dev/emulate`)

Fork of `vercel-labs/emulate` at `github.com/gmackie/emulate`. Adds two new packages:

| Package | Backing Technology | Protocol |
|---|---|---|
| `@emulators/postgres` | PGlite + pglite-socket | Postgres wire protocol (TCP) |
| `@emulators/redis` | redis-memory-server | Redis wire protocol (TCP) |

These follow the existing `ServicePlugin` interface from `@emulators/core`:

```typescript
export interface ServicePlugin {
  name: string;
  register(app, store, webhooks, baseUrl, tokenMap?): void;
  seed?(store, baseUrl): void;
}
```

Unlike HTTP-based emulators (GitHub, Google, etc.), the data services manage their own TCP listeners for wire-protocol connections. The Hono HTTP routes they register serve as an admin/status API (health checks, data browser, reset endpoint), exposed via portless at `https://postgres.emulate.localhost` and `https://redis.emulate.localhost`.

#### @emulators/postgres

- Uses `@electric-sql/pglite` for the in-process Postgres 17.4 engine
- Uses `@electric-sql/pglite-socket` to expose the Postgres wire protocol on TCP (default port 5432)
- Data persists to filesystem (`./data/pglite`) — clear with `rm -rf ./data/pglite`
- Sub-second startup, 3MB footprint
- Full compatibility with `postgres` npm driver and Drizzle ORM — zero code changes to `@gmacko/db`
- HTTP admin routes: `GET /status`, `POST /reset`, `GET /databases`

Seed config:

```yaml
postgres:
  port: 5432
  databases:
    - name: gmacko_dev
      extensions: [pgcrypto]
```

#### @emulators/redis

- Uses `redis-memory-server` to download and run a real Redis binary
- Full wire-protocol compatibility — any `ioredis`/`redis` client works
- ~4MB footprint, auto-cleans on process exit
- HTTP admin routes: `GET /status`, `POST /reset`, `POST /flush`

Seed config:

```yaml
redis:
  port: 6379
```

#### Registry Changes

Both services are added to `SERVICE_NAMES` and `SERVICE_REGISTRY` in `packages/emulate/src/registry.ts`:

```typescript
const SERVICE_NAME_LIST = [
  "vercel", "github", "google", "slack", "apple",
  "microsoft", "okta", "aws", "resend", "stripe",
  "mongoatlas", "clerk",
  "postgres",  // new
  "redis",     // new
] as const;
```

#### CLI Output

```
$ npx emulate --portless

  vercel      https://vercel.emulate.localhost
  github      https://github.emulate.localhost
  google      https://google.emulate.localhost
  apple       https://apple.emulate.localhost
  stripe      https://stripe.emulate.localhost
  resend      https://resend.emulate.localhost
  postgres    https://postgres.emulate.localhost  (wire: localhost:5432)
  redis       https://redis.emulate.localhost     (wire: localhost:6379)
  mongoatlas  https://mongoatlas.emulate.localhost
  ...
```

### Portless Integration (create-gmacko-app)

`portless.json` at repo root:

```json
{
  "name": "gmacko",
  "apps": {
    "apps/nextjs": { "name": "gmacko", "script": "dev:app" }
  }
}
```

Result: `https://gmacko.localhost` for the Next.js app.

### Dev Scripts

Root `package.json`:

```json
{
  "dev": "portless",
  "dev:emulate": "npx emulate --portless",
  "dev:all": "concurrently \"pnpm dev:emulate\" \"pnpm dev\""
}
```

`apps/nextjs/package.json`:

```json
{
  "dev": "portless",
  "dev:app": "pnpm with-env next dev"
}
```

### Emulate Seed Config

`emulate.config.yaml` at repo root:

```yaml
github:
  users:
    - login: dev-user
      name: Dev User
      email: dev@gmacko.localhost
  oauth_apps:
    - client_id: dev-github-client
      client_secret: dev-github-secret
      name: gmacko (dev)
      redirect_uris:
        - https://gmacko.localhost/api/auth/callback/github

google:
  users:
    - email: dev@gmail.com
      name: Dev User
  oauth_clients:
    - client_id: dev-google-client
      client_secret: dev-google-secret
      name: gmacko (dev)
      redirect_uris:
        - https://gmacko.localhost/api/auth/callback/google

apple:
  users:
    - email: dev@icloud.com
      name: Dev User
  oauth_clients:
    - client_id: com.gmacko.dev
      team_id: DEVTEAM01
      name: gmacko (dev)
      redirect_uris:
        - https://gmacko.localhost/api/auth/callback/apple

stripe:
  customers:
    - email: dev@gmacko.localhost
      name: Dev User
  products:
    - name: Pro Plan
      description: Monthly pro subscription
  prices:
    - product_name: Pro Plan
      currency: usd
      unit_amount: 2000

resend:
  domains:
    - name: gmacko.localhost
      region: us-east-1

postgres:
  port: 5432
  databases:
    - name: gmacko_dev

redis:
  port: 6379
```

### Environment Variables

`.env` for local development:

```env
# App (portless provides PORTLESS_URL automatically)
APP_URL=https://gmacko.localhost
NEXT_PUBLIC_APP_URL=https://gmacko.localhost

# Auth providers — point at emulated services
AUTH_GITHUB_ID=dev-github-client
AUTH_GITHUB_SECRET=dev-github-secret
AUTH_GOOGLE_ID=dev-google-client
AUTH_GOOGLE_SECRET=dev-google-secret
AUTH_APPLE_ID=com.gmacko.dev
AUTH_APPLE_SECRET=dev-apple-secret

# Magic link bypass
BYPASS_MAGIC_LINK=true

# Data services — direct TCP (not through portless)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/gmacko_dev
REDIS_URL=redis://localhost:6379

# Stripe — emulated
STRIPE_SECRET_KEY=sk_test_emulated
STRIPE_WEBHOOK_SECRET=whsec_emulated

# Email — emulated
RESEND_API_KEY=re_test_emulated
```

## Auth Changes

### Provider Swap: Discord → GitHub/Google/Apple

`@gmacko/auth` `initAuth` signature changes from:

```typescript
initAuth({ discordClientId, discordClientSecret, ... })
```

To:

```typescript
initAuth({
  githubClientId, githubClientSecret,
  googleClientId, googleClientSecret,
  appleClientId, appleClientSecret,
  ...
})
```

`socialProviders` config:

```typescript
socialProviders: {
  github: { clientId, clientSecret },
  google: { clientId, clientSecret },
  apple: { clientId, clientSecret, appBundleIdentifier },
}
```

In development, better-auth provider URLs point at emulated services via base URL overrides.

### Auth Env Schema

`packages/auth/env.ts` changes:

```typescript
server: {
  AUTH_GITHUB_ID: z.string().min(1),
  AUTH_GITHUB_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  AUTH_APPLE_ID: z.string().min(1).optional(),
  AUTH_APPLE_SECRET: z.string().min(1).optional(),
  AUTH_APPLE_BUNDLE_ID: z.string().min(1).optional(),
  AUTH_SECRET: ...,
  BYPASS_MAGIC_LINK: z.coerce.boolean().default(false),
}
```

### Magic Link with Bypass

Uses better-auth's `magicLink` plugin:

```typescript
import { magicLink } from "better-auth/plugins";

plugins: [
  magicLink({
    sendMagicLink: async ({ email, url }) => {
      await sendEmail({ to: email, subject: "Sign in", html: `<a href="${url}">Sign in</a>` });
    },
  }),
]
```

**Bypass mechanism:** When `BYPASS_MAGIC_LINK=true`, the server-side magic link endpoint returns the verification token directly in the response body alongside the standard response. The client detects this token and auto-navigates to the callback URL — the user sees a brief loading state then lands authenticated.

When `BYPASS_MAGIC_LINK=false` (production GA), the token is never exposed — standard "check your email" flow.

### Login UI

```
┌─────────────────────────────┐
│  Sign in with GitHub        │
│  Sign in with Google        │
│  Sign in with Apple         │
│  ── or ──                   │
│  [ email@example.com    ]   │
│  [ Continue with Email  ]   │
└─────────────────────────────┘
```

## What Gets Removed

- `docker-compose.yml` — no longer needed for dev (kept for production `web` service if desired)
- Discord OAuth dependency
- Docker Desktop as a dev requirement
- Manual port management

## Implementation Order

1. Fork emulate, add `@emulators/postgres` and `@emulators/redis`
2. Add `portless.json` and `emulate.config.yaml` to create-gmacko-app
3. Update dev scripts (root + apps/nextjs)
4. Swap auth providers (Discord → GitHub/Google/Apple)
5. Add magic link plugin + `BYPASS_MAGIC_LINK` flag
6. Update login UI
7. Update env schemas, `.env.example`, setup scripts
