# TODOS

## Infrastructure

### Queues-backed Jobs service

**What:** Replace the Phase 9 Cron-only `Jobs` stub with Cloudflare Queues (producer binding plus a consumer in `apps/web/src/server/worker.ts`) behind the same `Jobs` Effect interface.

**Why:** Waitlist emails, usage rollups, and Stripe webhook fan-out need retries and backoff that a cron tick cannot provide. Today `platformPrimitives.jobs.provider` is `local` and nothing consumes it.

**Context:** Proposed in the 2026-09-02 eng review of the TanStack + Effect + D1 migration plan (`docs/plans/2026-09-02-tanstack-effect-d1-migration.html`). The custom Worker entry from Phase 9 is where the `queue()` export lands. Local dev uses wrangler's queue emulation. The consumer must be idempotent because Queues deliver at least once. Start from `packages/api/src/jobs.ts` once Phase 9 lands; keep the interface so tests use the in-memory layer.

**Effort:** M
**Priority:** P2
**Depends on:** Migration Phase 9 (custom Worker entry)

### Realtime on Durable Objects

**What:** Replace `packages/realtime` (BullMQ + Redis, Node-only) with a Durable Object room per workspace exposing an Effect Rpc stream, mounted beside `AppApi`.

**Why:** After the migration the web lane has no realtime story; the package is marked unsupported on Workers.

**Context:** The integrations toggle `realtime.provider` currently allows only `redis` or `none`, and the scaffolder already has prune rules for the package. A DO-backed implementation is Workers-native, needs no Redis, and gives per-workspace isolation. Costs: the DO pricing model, a second (Rpc) surface next to HttpApi, and a WebSocket client for Expo. Design the `Realtime` Effect service interface first so the in-memory layer keeps tests fast.

**Effort:** L
**Priority:** P3
**Depends on:** Migration Phase 8 cutover and the custom Worker entry

## Web

### Evaluate effect-atom for the web client

**What:** Time-boxed spike: prototype `AtomHttpApi` in `apps/web` for the settings page and compare with TanStack Query on SSR hydration, cache invalidation, and Expo parity.

**Why:** The migration plan deferred effect-atom to avoid risk. Once the API is stable, an Effect-native client could remove the Promise boundary in `api-client`'s `run()` and let typed errors reach components directly.

**Context:** `packages/api-client/src/queries` is the seam; both web and Expo import query keys from there, so any switch must keep Expo working or move it too. The SSR dehydration story for effect-atom is younger than `@tanstack/react-router-ssr-query`. Outcome is a written recommendation, not a migration.

**Effort:** S
**Priority:** P3
**Depends on:** Migration Phase 6 (api-client) and the 0.2.1 release

## Database

### D1 read replication rollout

**What:** Enable D1 read replication and thread the Sessions API bookmark through a cookie so users read their own writes. The `Database` layer already accepts a bookmark option.

**Why:** A single-region primary means far users pay cross-region latency on every SSR read.

**Context:** The migration plan keeps replication off at launch. Before enabling: measure p95 read latency from two regions on staging with tracing on, then decide. Bookmark handling touches every response; replication lag becomes visible in admin lists, so document it.

**Effort:** S
**Priority:** P3
**Depends on:** Migration Phase 7 staging deploy with OTLP tracing

## Completed
