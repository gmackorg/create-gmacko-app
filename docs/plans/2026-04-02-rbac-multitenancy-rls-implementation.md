# RBAC, Multi-Tenancy, And Postgres RLS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Add scaffold-time tenancy selection plus shared RBAC, workspace resolution, and Postgres RLS foundations for generated apps.

**Architecture:** Keep one workspace-based schema for both single-tenant and multi-tenant apps. Move tenant selection into generated config, resolve the active workspace explicitly in server context, and push tenant isolation into Postgres session settings and RLS policies instead of relying only on app-layer filters.

**Tech Stack:** Turborepo, pnpm, Commander, clack, Next.js 16, Expo SDK 55, Better Auth, tRPC, Drizzle ORM, Postgres, Vitest, Biome, Oxlint.

## Task 1: Add Tenancy Mode To The Generator

**Files:**
- Modify: `/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/types.ts`
- Modify: `/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/index.ts`
- Modify: `/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/prompts.ts`
- Modify: `/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts`
- Test: `/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`

**Steps:**
1. Write failing scaffold tests for generated tenancy config and README output.
2. Add a `tenancyMode` option with `single-tenant | multi-tenant`.
3. Add CLI flags and prompt flow for scaffold-time tenancy selection.
4. Write tenancy config into generated `packages/config/src/integrations.ts`.
5. Re-run targeted scaffold tests.

## Task 2: Add Shared Tenancy Config Helpers

**Files:**
- Modify: `/Volumes/dev/create-gmacko-app/packages/config/src/integrations.ts`
- Modify: `/Volumes/dev/create-gmacko-app/packages/config/src/index.ts`
- Test: `/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`

**Steps:**
1. Add exported tenancy config and helper predicates.
2. Keep naming aligned with the generator contract.
3. Ensure generated apps can branch on tenancy mode without string literals spread across the repo.
4. Re-run the generator tests that inspect emitted config.

## Task 3: Add DB Session Context And RLS Helpers

**Files:**
- Modify: `/Volumes/dev/create-gmacko-app/packages/db/src/schema.ts`
- Modify: `/Volumes/dev/create-gmacko-app/packages/db/src/client.ts`
- Modify: `/Volumes/dev/create-gmacko-app/packages/db/src/index.ts`
- Create: `/Volumes/dev/create-gmacko-app/packages/db/src/tenant.ts`
- Test: `/Volumes/dev/create-gmacko-app/packages/db/src/__tests__/schema.test.ts`

**Steps:**
1. Write failing schema tests for tenancy enums and settings fields.
2. Add explicit tenancy mode support to application settings.
3. Add helpers for opening tenant-aware DB transactions and setting local Postgres session values.
4. Add reusable SQL helpers for enabling RLS and defining workspace membership policies.
5. Re-run schema tests.

## Task 4: Make API Context Resolve Workspace Explicitly

**Files:**
- Modify: `/Volumes/dev/create-gmacko-app/packages/api/src/trpc.ts`
- Modify: `/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts`
- Modify: `/Volumes/dev/create-gmacko-app/packages/api/src/router/admin.ts`
- Test: `/Volumes/dev/create-gmacko-app/packages/api/src/router/__tests__/settings.test.ts`
- Test: `/Volumes/dev/create-gmacko-app/packages/api/src/router/__tests__/admin.test.ts`

**Steps:**
1. Write failing router tests for explicit workspace resolution and no platform-admin bypass.
2. Add shared workspace context resolution based on request headers plus settings defaults.
3. Stop using implicit “first membership wins” logic in protected workspace flows.
4. Return enough workspace context for runtime clients to switch or persist the active workspace.
5. Re-run targeted router tests.

## Task 5: Update Runtime Docs And Verify

**Files:**
- Modify: `/Volumes/dev/create-gmacko-app/docs/ai/INITIAL_PROPOSAL.md`
- Modify: `/Volumes/dev/create-gmacko-app/docs/ai/IMPLEMENTATION_PLAN.md`
- Modify: `/Volumes/dev/create-gmacko-app/DESIGN.md`

**Steps:**
1. Align the proposal and implementation docs with scaffold-time tenancy selection.
2. Remove stale references that treat multi-workspace support as purely later work.
3. Run targeted verification for scaffold, schema, and router coverage.
