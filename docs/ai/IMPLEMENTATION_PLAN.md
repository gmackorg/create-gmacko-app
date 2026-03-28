# ForgeGraph Template Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Keep `create-gmacko-app` aligned around ForgeGraph-managed deployments, colocated Postgres, and Nix-based repo setup while removing stale platform-specific assumptions from the generated template.

**Architecture:** The template should assume one application repo that can live directly inside a ForgeGraph deployment workflow. Generated apps should run against standard Postgres first, expose generic environment contracts, and keep deployment orchestration outside app runtime code unless the app must know about previews or health checks.

**Tech Stack:** Turborepo, pnpm, Next.js, Expo, TanStack Start, Drizzle ORM, Postgres, Better Auth, ForgeGraph deployment handoff docs, Nix dev shell via `flake.nix`.

## Current Priorities

1. Keep the generated repo operational with Postgres deployed alongside the app by default.
2. Keep ForgeGraph as the only active deployment guidance path in current docs and scaffolding.
3. Prefer Nix-based developer and deployment setup where it improves reproducibility without adding fragile app-specific runtime coupling.
4. Remove or archive stale assumptions instead of carrying parallel deployment systems forward.
5. Expand the template into a real SaaS starter through modular opt-in business capabilities instead of a generic framework shell.

## Workstreams

### 1. Runtime and Environment Shape

- Keep database access generic around `DATABASE_URL`.
- Prefer app-owned URL configuration such as `APP_URL` over host-specific environment shims.
- Limit preview-specific runtime logic to generic `PREVIEW_*` variables.
- Ensure generated apps can boot locally with `docker compose up -d postgres` and then move into ForgeGraph with the same basic env model.

### 2. Deployment Surface

- Keep deployment guidance in [`/Volumes/dev/create-gmacko-app/deploy/README.md`](/Volumes/dev/create-gmacko-app/deploy/README.md) and [`/Volumes/dev/create-gmacko-app/deploy/forgegraph/README.md`](/Volumes/dev/create-gmacko-app/deploy/forgegraph/README.md).
- Treat ForgeGraph as the deployment control plane and [`/Volumes/dev/create-gmacko-app/flake.nix`](/Volumes/dev/create-gmacko-app/flake.nix) as the reproducible shell/build starting point.
- Keep preview workflows as handoff or orchestration hooks, not platform-specific deployment implementations embedded in this repo.

### 3. Generator Guarantees

- Generated repos should not ship dead deployment directories or provider-specific env presets.
- Provisioning should offer colocated Postgres and ForgeGraph deployment guidance.
- Tests should assert the absence of stale deployment/runtime hooks and the presence of current ForgeGraph/Postgres/Nix expectations.

### 4. SaaS Scaffold Expansion

- The generated app should support a guided first-run bootstrap flow, workspace-centric onboarding, and a future-friendly SaaS schema.
- SaaS layers such as collaboration, billing, limits, metering, support, launch controls, referrals, operator APIs, and platform primitives should remain modular wizard opt-ins.
- Generated apps should stay AI-native after scaffold, with a shared app-local planning workspace and feature-aware follow-up guidance for Claude, Codex, and OpenCode.

## Verification Standard

Any migration or cleanup against this plan should verify:

1. `packages/create-gmacko-app` scaffold tests still pass.
2. Provisioning tests still pass.
3. Active docs describe only the current deployment direction.
4. Remaining historical references live under [`/Volumes/dev/create-gmacko-app/docs/legacy`](/Volumes/dev/create-gmacko-app/docs/legacy) or in negative assertions inside tests.

## Archive

The previous implementation plan now lives at [`/Volumes/dev/create-gmacko-app/docs/legacy/ai/IMPLEMENTATION_PLAN.md`](/Volumes/dev/create-gmacko-app/docs/legacy/ai/IMPLEMENTATION_PLAN.md).

## Related Roadmap

For the broader “make this a showcase and highly adoptable starter” roadmap, see [`/Volumes/dev/create-gmacko-app/docs/plans/2026-03-25-template-showcase-roadmap.md`](/Volumes/dev/create-gmacko-app/docs/plans/2026-03-25-template-showcase-roadmap.md).

For the execution-grade breakdown of that roadmap, including task order, files, and verification gates, see [`/Volumes/dev/create-gmacko-app/docs/plans/2026-03-25-template-showcase-execution-plan.md`](/Volumes/dev/create-gmacko-app/docs/plans/2026-03-25-template-showcase-execution-plan.md).

For the dedicated SaaS scaffold expansion plan, including wizard options, schema direction, bootstrap flow, and operator lane work, see [`/Volumes/dev/create-gmacko-app/docs/plans/2026-03-27-saas-scaffold-implementation.md`](/Volumes/dev/create-gmacko-app/docs/plans/2026-03-27-saas-scaffold-implementation.md).
