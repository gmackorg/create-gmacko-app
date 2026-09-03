# Template Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Keep `create-gmacko-app` aligned around one Cloudflare Worker per stage (TanStack Start + Effect `HttpApi`) with a D1 database per stage, deployed through ForgeGraph, while removing stale platform assumptions from the generated template.

**Architecture:** One application repo whose web app is a single Worker: TanStack Start renders and routes, the Effect `HttpApi` declared in `packages/domain` serves `/api/*` from `packages/api`, and `packages/db` talks to D1 through Drizzle's Effect API. Every client (browser, SSR loader, Expo, operator CLI/MCP, generated SDKs) uses `@gmacko/api-client` over the same contract. Deployment orchestration (migrate, then `wrangler deploy`; secrets; previews) lives in `scripts/` and `.forgegraph.yaml`, outside app runtime code.

**Tech Stack:** Turborepo, pnpm, TanStack Start (React 19, Vite), Effect 4 (`HttpApi`, `Schema`, observability), Cloudflare Workers + D1, Drizzle ORM (Effect API, `@effect/sql-d1`), Better Auth, Expo, ForgeGraph, `@gmacko/emulate` + `portless` for local development.

## Current Priorities

1. Keep the generated repo operational on a local D1 with `pnpm db:migrate:local && pnpm db:seed && pnpm dev`, and on Workers + D1 in every deployed stage.
2. Keep ForgeGraph as the only active deployment path in current docs and scaffolding (`.forgegraph.yaml`, `scripts/deploy-stage.mjs`, `pnpm secrets:push`).
3. Keep the contract the single source of truth: endpoints declare their credential and rate limit, `docs/API_AUTH.md` and the OpenAPI spec are generated from it, and `pnpm check:standards` enforces the invariants in `AGENTS.md`.
4. Remove or archive stale assumptions (`docs/legacy/`) instead of carrying parallel stacks forward.
5. Expand the template into a real SaaS starter through modular opt-in business capabilities instead of a generic framework shell.

## Workstreams

### 1. Runtime and Environment Shape

- The Worker reads bindings once through `AppConfig.fromBindings`; nothing in the Worker bundle reads `process.env`.
- Locally, bindings come from the repo-root `.env` through the `apps/web/.env` link; `.dev.vars` is never created.
- Prefer app-owned URL configuration (`APP_URL`, `PORTLESS_URL`) over host-specific shims; `STAGE` is a wrangler var per environment.
- Generated apps boot with no database server: local D1 under `apps/web/.wrangler/state`, service emulators from `@gmacko/emulate`.

### 2. Deployment Surface

- Keep deployment guidance in [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md), [`deploy/README.md`](../../deploy/README.md), and [`deploy/forgegraph/README.md`](../../deploy/forgegraph/README.md).
- Every stage deploy is `scripts/deploy-stage.mjs`: apply the pending D1 migrations, and only if that succeeds, build and `wrangler deploy`. ForgeGraph runs the same script.
- Migrations are forward-only and expand/contract ([`docs/drizzle-migrations.md`](../drizzle-migrations.md)); rollback is a Worker version rollback or a D1 Time Travel restore ([`docs/RUNBOOK.md`](../RUNBOOK.md)).
- Previews are one Worker per pull request on a shared preview D1; per-PR databases are Phase 9 of the migration plan.

### 3. Generator Guarantees

- Generated repos ship no dead deployment directories, no `DATABASE_URL`, and no provider-specific env presets.
- Provisioning offers ForgeGraph deployment guidance and the `wrangler d1 create` steps.
- Scaffold tests assert the presence of the current Workers/D1/ForgeGraph expectations and the absence of stale runtime hooks.
- `pnpm check:fast` (lint, typecheck, standards) passes on every scaffold profile in `.github/workflows/cli-e2e.yml`.

### 4. SaaS Scaffold Expansion

- The generated app supports a guided first-run bootstrap flow, workspace-centric onboarding, and a future-friendly SaaS schema.
- SaaS layers such as collaboration, billing, limits, metering, support, launch controls, referrals, operator APIs, and platform primitives remain modular wizard opt-ins.
- Generated apps stay AI-native after scaffold, with a shared app-local planning workspace and feature-aware follow-up guidance for Claude, Codex, and OpenCode.

### 5. Migration Follow-ups (Phase 9)

- `Model.Class` adoption in the contract and the remaining hardening listed in `docs/adr/0001-tanstack-effect-d1.md`.
- Per-PR preview databases.
- The data-migration recipe from the previous stack to D1.

## Verification Standard

Any migration or cleanup against this plan should verify:

1. `packages/create-gmacko-app` scaffold tests still pass.
2. Provisioning tests still pass.
3. `pnpm check:fast`, `pnpm test`, and `pnpm test:workers` pass in the template.
4. Active docs describe only the current deployment direction.
5. Remaining historical references live under [`docs/legacy`](../legacy/README.md) or in negative assertions inside tests.

## Archive

The previous implementation plan lives at [`docs/legacy/ai/IMPLEMENTATION_PLAN.md`](../legacy/ai/IMPLEMENTATION_PLAN.md).

## Related Roadmap

For the migration itself, its phases, kill criteria, and Phase 9 follow-ups, see [`docs/plans/2026-09-02-tanstack-effect-d1-migration.html`](../plans/2026-09-02-tanstack-effect-d1-migration.html) and the ADR.

For the broader "make this a showcase and highly adoptable starter" roadmap, see [`docs/plans/2026-03-25-template-showcase-roadmap.md`](../plans/2026-03-25-template-showcase-roadmap.md) and its execution plan [`docs/plans/2026-03-25-template-showcase-execution-plan.md`](../plans/2026-03-25-template-showcase-execution-plan.md).

For the dedicated SaaS scaffold expansion plan, including wizard options, schema direction, bootstrap flow, and operator lane work, see [`docs/plans/2026-03-27-saas-scaffold-implementation.md`](../plans/2026-03-27-saas-scaffold-implementation.md).
