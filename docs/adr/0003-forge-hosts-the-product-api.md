# ADR 0003: The product API is hosted in Forge

- Status: Accepted (2026-10-10)
- Builds on: [ADR 0002](./0002-forge-is-the-integration-api.md)

## Decision

Posts, customers, and the partner notification are one Forge package, [`forge/`](../../forge). A second Cloudflare Worker, [`apps/forge`](../../apps/forge), hosts the forgec 0.5.0 bundle with `@forgegraph/runtime` 0.5.0. The web and Expo post screens call `http://127.0.0.1:8787/v1/posts`.

Auth, settings, admin, launch, and health stay on the Effect `HttpApi` in the web Worker. better-auth stays there. This is the majority of the scaffold: the product a new app ships is the Forge package, and the Effect worker is the app shell.

`@forgegraph/runtime` 0.5.0 is not on npm. The template vendors that build in `packages/forge-runtime` and `packages/forge-capability-manifest`. Replace those packages when 0.5.0 is published. Do not point them at a machine-local path.

Local auth is `FORGE_AUTH=dev-headers`. That trusts `x-forge-tenant` and `x-forge-actor`. It is for the local scaffold. A reachable deployment replaces it. The contract's bearer scheme is what a partner uses.

Effect still publishes `GET` and `POST /api/posts`. `packages/api/src/layer.test.ts` uses that group as the public database-backed fixture (a database failure, tracing, a missing id, and the rate limit). The product UI does not call it. Operator commands that still speak `/api/posts` are on that fixture, not the product contract.

## Consequences

- A product resource is a Forge declaration, then `pnpm forge:api`. That command refreshes `apps/forge/src/app.json` and `apps/forge/migrations/0001_init.sql`.
- The Forge worker has its own D1 database, `gmacko-forge`. The web app's drizzle `post` table stays for the Effect fixture. Do not drop it.
- `Post` is not `@versioned`. The host accepts `DELETE` without `If-Match`, and the record response has no `ETag`. The OpenAPI document still lists that header. The client sends `If-Match` only when a read returns an `ETag`.
- `NotifyPartner` is the one function the compiler does not implement. `apps/forge/src/notify.ts` reads the customer and returns `{ "accepted": true }` when the event is 1–64 characters. A real integration replaces that body.
- The client origin is `http://127.0.0.1:8787`. The iOS simulator and the browser on this machine reach it. A physical device or the Android emulator needs that machine's reachable address.
- `pnpm dev` starts this worker with the web app. `GET /healthz` is host liveness, not a Forge operation.
- Production deploy of `apps/forge` is out of scope for this decision. ForgeGraph still deploys the web Worker.
