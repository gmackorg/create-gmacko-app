# @gmacko/web

TanStack Start app served as a Cloudflare Worker (`src/server/worker.ts`),
with the Effect HTTP API mounted under `/api/*` (`@gmacko/api`, built in
`src/server/runtime.ts`) and better-auth under `/api/auth/*`.

## Scripts

- `pnpm dev` - Vite dev server with the ssr environment running in workerd
  (`predev` links `.env`, see below); `pnpm dev:portless` is the same under
  portless at `https://gmacko.localhost` (what the root `pnpm dev` runs) and
  links `.env` itself before starting Vite. `pnpm dev:check` runs that
  preparation alone and fails if no `apps/web/.env` came out of it.
- `pnpm build` / `pnpm preview` - production build and local preview.
- `pnpm deploy:<preview|staging|production>` - `CLOUDFLARE_ENV=<env> vite
  build && wrangler deploy`; `:dry-run` variants compile without uploading.
  Run through the root `pnpm deploy:<stage>` so the stage's D1 migrations
  go first (docs/DEPLOYMENT.md).
- `pnpm e2e` - the Playwright suite (see "Browser tests").
- `pnpm cf-typegen` - regenerate `worker-configuration.d.ts` from `wrangler.jsonc`.

## How pages get their data

Every read and write goes through the contract client: `src/lib/api.ts`
builds `queries` and `mutations` from `@gmacko/api-client/queries` over a
client that is in-process on the server (the SSR loader calls the API
handler directly, forwarding only the page request's `cookie` and
`cf-connecting-ip`, and sharing one `RequestContext` per render) and `fetch`
in the browser. Route loaders `prefetchQuery`/`ensureQueryData` what the page
needs; components `useSuspenseQuery` the same options; mutations invalidate
through the meta the query layer attaches (`makeQueryClient`). Query keys are
never spelled in this app.

Forms validate client-side with the domain's Standard Schema views
(`CreatePostForm`, `WaitlistSubmitForm`, `MagicLinkRequestForm`,
`UpdatePreferencesForm`, `CreateApiKeyForm`, `CreateInviteForm`), so a 400 from
the server's decoder is rare. Typed errors become words in
`src/lib/errors.ts` (`Unauthorized` → "Sign in to continue.", `Forbidden{scope}`
→ "This API key lacks permission...", `Conflict{reason}` → the reason's
sentence, `RateLimited` → the retry-after).

Query data crosses SSR through TanStack's serializer, which refuses class
instances; `dehydrate.serializeData` flattens the contract's `Schema.Class`
results to plain objects first (`src/lib/plain.ts`).

### Server functions

`createServerFn` is used for actions that must set a cookie or redirect, and
nothing else (plan principle 09). The only file is `src/server/actions.ts`:
`signOut`. Data never goes through a server function; `grep createServerFn
src` should list that file alone.

## Environment: `apps/web/.env` is a link to the repo-root `.env`

Wrangler and the Cloudflare Vite plugin load `.env` / `.env.local` from the
directory of `wrangler.jsonc` and nowhere else; `process.env` is not copied
into the Worker unless `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` (the bridge the
`dev` script used to set). Measured on this repo:

- `dotenv -e ../../.env -- vite dev` without the bridge: the Worker sees
  `DB` and `STAGE` only.
- `apps/web/.env -> ../../.env` (symlink) and plain `vite dev`: wrangler logs
  `Using secrets defined in .env` and every root variable is a binding.

So `predev` (`scripts/link-env.mjs`) creates that symlink (a copy where
symlinks are unavailable), and under portless `scripts/dev-portless.mjs`
runs the same `linkEnv` (pnpm runs no `pre` hook for `dev:portless`) and
writes `PORTLESS_URL` to `apps/web/.env.local` (loaded after `.env`) so the
Worker knows its public origin; `pnpm dev:check` asserts the link is in
place. emulate keeps writing the repo-root `.env`; nothing
under `src/` reads `process.env`. `src/env.ts` holds only the browser-visible
`VITE_*` values (validated with `@t3-oss/env-core`); the server reads its
bindings once in `src/server/config.ts`. (A `.dev.vars` file must never be
created: its presence disables `.env` loading.)

Note for `vite preview`: the plugin bakes the `.env` it saw at build time into
`dist/server/.dev.vars`; a preview does not re-read `.env`.

## Auth, telemetry and Sentry configuration

`src/server/config.ts` (`AppConfig.fromBindings`, `webFromBindings`) is the
only reader of these bindings. In `staging` and `production` it requires
`AUTH_SECRET`, one complete OAuth pair (GitHub, Google or Apple id+secret)
and, when the Stripe feature is on, `STRIPE_SECRET_KEY` +
`STRIPE_WEBHOOK_SECRET`; a missing one stops the Worker at load with the
full list and the `pnpm secrets:push --stage <stage>` fix. Development and
PR previews boot without them.

| Binding | Purpose |
| --- | --- |
| `APP_URL` / `PORTLESS_URL` | Public origin (cookies, OAuth callbacks, trusted origins). Defaults to `http://localhost:3001`. |
| `AUTH_SECRET` | better-auth secret. |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, `AUTH_APPLE_*` | OAuth clients (GitHub/Google are generic OAuth providers, Apple is built in). |
| `AUTH_GITHUB_URL`, `AUTH_GITHUB_API_URL`, `AUTH_GOOGLE_URL`, `AUTH_GOOGLE_TOKEN_URL`, `AUTH_APPLE_URL` | Point the providers at `npx @gmacko/emulate` locally. |
| `BYPASS_MAGIC_LINK=true` | Print magic links to the server log instead of emailing them. **Development only**: `AppConfig.fromBindings` throws at load when it is set on any other `STAGE`. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` (+ `OTEL_EXPORTER_OTLP_HEADERS`) | OTLP/HTTP export of traces, logs and metrics (`@gmacko/telemetry`'s `Observability.layer`, wired in `src/server/runtime.ts`); flushed on `waitUntil` after every request. Unset → off; JSON console logging stays on either way. |
| `SENTRY_DSN` | Enables the Worker Sentry wrapper (`@gmacko/monitoring/web/server`'s `withSentry`, composed in `src/server/worker.ts` via `make-worker.ts`). Unset → no-op. |
| `STRIPE_SECRET_KEY` | Stripe API key; required in staging/production when the Stripe feature is on. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `POST /api/webhooks/stripe`; unset → the route answers 503. |
| `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | Browser Sentry (`@gmacko/monitoring/web`'s `initSentryWeb` in `src/client.tsx`; the Workers SDK never enters the browser bundle, `src/__tests__/client-bundle.test.ts` checks) and PostHog (`src/providers.tsx`); both off when unset. |

Build-time only: `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`, `SENTRY_PROJECT`) turns
on the Sentry Vite plugin, which uploads hidden source maps for the
`__APP_VERSION__` release and deletes them from `dist/`.

## Security headers

`src/server/headers.ts` is a TanStack Start request middleware (registered in
`src/start.ts`) that sets `X-Frame-Options: DENY`, `Referrer-Policy:
strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, a
`Permissions-Policy`, HSTS on every stage but development, and on HTML a
Content-Security-Policy with a per-request nonce. The nonce reaches the router
as request context (`getGlobalStartContext().nonce` → `ssr.nonce` in
`src/router.tsx`); Start stamps it on every inline script it streams and
publishes it as `<meta property="csp-nonce">` for the client, and the theme
detector script in `ThemeProvider` takes the same nonce. `script-src` is
`'self' 'nonce-…'`; `style-src` allows inline styles (React `style=`, sonner).

## Stripe webhook

`POST /api/webhooks/stripe` (`src/routes/api.webhooks.stripe.ts` →
`src/server/stripe-webhook.ts`) verifies the delivery with
`@gmacko/payments`' `constructWebhookEvent` (`constructEventAsync` over
SubtleCrypto, fetch HTTP client) and acknowledges it; a bad signature is a
400, a missing secret a 503. Billing side effects arrive with the billing
layer.

## Browser tests

`pnpm e2e` (root: `pnpm e2e:web`) runs Playwright against `vite dev` on port
3111 (`E2E_PORT`) with the Worker's bindings passed through the process
environment (`e2e/helpers/env.ts`; `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` is
set for that server only) and its own local D1 under `.wrangler/e2e`
(`E2E_STATE_DIR` → the Vite plugin's `persistState`, `--persist-to` for the
helpers). `e2e/global-setup.ts` migrates and seeds that database and starts an
emulated GitHub (`@gmacko/emulate`, port 4310) for the OAuth journey;
`e2e/helpers/db.ts` resets rows per spec and reads magic-link tokens back from
the `verification` table, so sign-in runs through the real magic-link flow
with `BYPASS_MAGIC_LINK=true`.

In development only, an `x-test-delay: <ms>` request header holds an API
response (capped at 10s) so a spec can leave a page while a mutation is in
flight.

## Running against emulate without portless

Without portless this app runs on plain `http://localhost:3001` (`pnpm -F
@gmacko/web dev`). The emulated OAuth providers accept that origin: `emulate.config.yaml` lists
`http://localhost:3001/api/auth/callback/{github,google}` next to the
`https://gmacko.localhost` redirect URIs.

1. `npx @gmacko/emulate` (no `--portless`). With the default base port 4000
   the services come up on `http://localhost:4001` (GitHub) and
   `http://localhost:4002` (Google); `emulate` prints the actual ports at
   start-up, and `--port` / `EMULATE_PORT` shifts them.
2. In the repo-root `.env` (linked into `apps/web/.env` by `predev`):

   ```sh
   STAGE=development
   APP_URL=http://localhost:3001
   # leave PORTLESS_URL unset
   AUTH_SECRET=<any 32+ chars>
   AUTH_GITHUB_ID=dev-github-client
   AUTH_GITHUB_SECRET=dev-github-secret
   AUTH_GITHUB_URL=http://localhost:4001
   AUTH_GITHUB_API_URL=http://localhost:4001
   AUTH_GOOGLE_ID=dev-google-client
   AUTH_GOOGLE_SECRET=dev-google-secret
   AUTH_GOOGLE_URL=http://localhost:4002
   AUTH_GOOGLE_TOKEN_URL=http://localhost:4002/oauth2/token
   BYPASS_MAGIC_LINK=true
   ```

   The client ids/secrets are the seeds in `emulate.config.yaml`. The GitHub
   emulator serves both `github.com` and `api.github.com` paths from one
   origin, hence the same value for `AUTH_GITHUB_URL` and
   `AUTH_GITHUB_API_URL`; `AUTH_GOOGLE_TOKEN_URL` replaces
   `https://oauth2.googleapis.com/token` (the emulator serves it at
   `/oauth2/token`), and the authorization endpoint
   `/o/oauth2/v2/auth` hangs off `AUTH_GOOGLE_URL`.
3. `pnpm -F @gmacko/db migrate:local && pnpm -F @gmacko/db seed:local`, then
   `pnpm -F @gmacko/web dev` and sign in at `http://localhost:3001`. The first
   signed-in user completes the bootstrap screen and becomes the admin.
