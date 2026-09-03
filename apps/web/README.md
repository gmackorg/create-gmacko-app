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
