# @gmacko/web

TanStack Start app served as a Cloudflare Worker (`src/server/worker.ts`),
with the Effect HTTP API mounted under `/api/*` (`src/server/api.ts`,
`src/server/runtime.ts`).

## Scripts

- `pnpm dev` - Vite dev server with the ssr environment running in workerd.
- `pnpm build` / `pnpm preview` - production build and local preview.
- `pnpm cf-typegen` - regenerate `worker-configuration.d.ts` from `wrangler.jsonc`.

## `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` in the `dev` script

<!-- TODO(migration Phase 5): remove this bridge. -->

The `dev` script sets `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` so the Cloudflare
Vite plugin copies the Node `process.env` (loaded from `../../.env` by
`with-env`) into the Worker's `process.env`. It exists only because
`src/env.ts` (t3 `createEnv` over `process.env`) and `src/lib/url.ts` still
read `process.env` directly. Both are legacy carry-overs from the Next.js app.

Phase 5 of the migration replaces them with the `AppConfig` service in
`src/server/api.ts`, built once in `src/server/runtime.ts` from
`cloudflare:workers` env. Once no module under `src/` reads `process.env`,
drop the variable from the `dev` script and delete this section.

## Auth, telemetry and Sentry configuration

`src/server/config.ts` (`AppConfig.fromBindings`) is the only reader of these
bindings; in development they come from the repo-root `.env` through the
`dev` script bridge above.

| Binding | Purpose |
| --- | --- |
| `APP_URL` / `PORTLESS_URL` | Public origin (cookies, OAuth callbacks, trusted origins). Defaults to `http://localhost:3001`. |
| `AUTH_SECRET` | better-auth secret. |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, `AUTH_APPLE_*` | OAuth clients (GitHub/Google are generic OAuth providers, Apple is built in). |
| `AUTH_GITHUB_URL`, `AUTH_GITHUB_API_URL`, `AUTH_GOOGLE_URL`, `AUTH_GOOGLE_TOKEN_URL`, `AUTH_APPLE_URL` | Point the providers at `npx @gmacko/emulate` locally. |
| `BYPASS_MAGIC_LINK=true` | Print magic links to the server log instead of emailing them. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` (+ `OTEL_EXPORTER_OTLP_HEADERS`) | OTLP/HTTP export of traces, logs and metrics (`src/server/observability.ts`); flushed on `waitUntil` after every request. Unset → off. |
| `SENTRY_DSN` | Enables `@sentry/cloudflare`'s `withSentry` wrapper in `src/server/worker.ts`. Unset → no-op. |

`/api/auth/*` is better-auth (`@gmacko/auth`); `/api/*` is the Effect HttpApi.
SSR loaders call the API in-process through `src/lib/local-transport.ts`.
