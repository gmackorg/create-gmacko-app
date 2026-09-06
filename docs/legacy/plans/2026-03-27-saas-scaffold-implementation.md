# SaaS Scaffold Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Expand `create-gmacko-app` so it can scaffold a real SaaS baseline with guided bootstrap, workspace-centric onboarding, optional business capability layers, and agent-aware follow-up workflows.

**Architecture:** Keep the SaaS system modular. The generator should expose separate opt-ins for collaboration, billing, metering, support, launch controls, referrals, operator APIs, and related platform primitives, while preserving a simple default runtime path. The generated app should remain workspace-centric, but v1 product behavior should expose one visible workspace per user even though the schema stays future-friendly.

**Tech Stack:** Turborepo, pnpm, Next.js 16, Expo SDK 55, TanStack Start, Better Auth, tRPC, Drizzle ORM, Postgres, ForgeGraph, Nix, Vitest, Biome, Oxlint.

---

## Plan Rules

- Implement this plan in small batches with tests or contract assertions added before behavior changes.
- Keep active docs aligned in [`/Volumes/dev/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/README.md), [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/README.md), [`/Volumes/dev/create-gmacko-app/docs/ai/INITIAL_PROPOSAL.md`](/Volumes/dev/create-gmacko-app/docs/ai/INITIAL_PROPOSAL.md), and [`/Volumes/dev/create-gmacko-app/docs/ai/IMPLEMENTATION_PLAN.md`](/Volumes/dev/create-gmacko-app/docs/ai/IMPLEMENTATION_PLAN.md).
- Prefer generator contract tests in [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts) before deep runtime edits.
- Keep new SaaS capability layers opt-in unless they are true platform primitives required by the baseline.
- Do not touch unrelated `create-site` worktree files while executing this plan.

## Task 1: Add SaaS Wizard Surface

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/types.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/types.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/index.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/index.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/prompts.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/prompts.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Write failing scaffold tests for new SaaS opt-ins such as `collaboration`, `billing`, `metering`, `support`, `launch`, `referrals`, and `operator APIs`.
2. Extend the scaffold option types so those feature flags have explicit booleans instead of ad hoc string checks.
3. Add prompt/wizard questions that keep the baseline modular and avoid one giant SaaS toggle.
4. Run targeted scaffold tests to verify the prompt and option plumbing.
5. Commit with a message like `feat: add saas wizard options`.

## Task 2: Scaffold The AI Bootstrap Handoff

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/docs/ai/BOOTSTRAP_PLAYBOOK.md`](/Volumes/dev/create-gmacko-app/docs/ai/BOOTSTRAP_PLAYBOOK.md)
- Modify: [`/Volumes/dev/create-gmacko-app/CLAUDE.md`](/Volumes/dev/create-gmacko-app/CLAUDE.md)
- Modify: [`/Volumes/dev/create-gmacko-app/AGENTS.md`](/Volumes/dev/create-gmacko-app/AGENTS.md)
- Test: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Write failing tests for feature-aware skill recommendations in generated READMEs and bootstrap docs.
2. Generate post-bootstrap recommendations for Claude, Codex, and OpenCode based on selected SaaS options.
3. Keep Claude-only user-level skills clearly labeled while providing equivalent repo-level guidance for other agents.
4. Re-run scaffold tests and ensure docs remain coherent when SaaS options are not selected.
5. Commit with a message like `feat: scaffold saas ai handoff`.

## Task 3: Add First-Run Bootstrap App State

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/page.tsx`](/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/page.tsx)
- Modify: [`/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/(authenticated)/settings/page.tsx`](/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/(authenticated)/settings/page.tsx)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/api/src/router/admin.ts`](/Volumes/dev/create-gmacko-app/packages/api/src/router/admin.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts`](/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/db/src/schema.ts`](/Volumes/dev/create-gmacko-app/packages/db/src/schema.ts)
- Test: [`/Volumes/dev/create-gmacko-app/packages/api/src/router/__tests__/admin.test.ts`](/Volumes/dev/create-gmacko-app/packages/api/src/router/__tests__/admin.test.ts)

**Steps:**
1. Write failing API tests for detecting uninitialized app state and completing first-run setup.
2. Add a minimal application-settings or bootstrap-state model in the schema.
3. Implement a first-run setup mutation that creates the initial platform admin, first user, and first workspace.
4. Update the web app to show setup UI when the app is uninitialized instead of landing in a broken shell.
5. Run the targeted API and web tests, then commit with `feat: add first-run app bootstrap`.

## Task 4: Introduce Workspace-Centric SaaS Schema

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/packages/db/src/schema.ts`](/Volumes/dev/create-gmacko-app/packages/db/src/schema.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/auth/src/index.ts`](/Volumes/dev/create-gmacko-app/packages/auth/src/index.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts`](/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/api/src/router/admin.ts`](/Volumes/dev/create-gmacko-app/packages/api/src/router/admin.ts)
- Test: [`/Volumes/dev/create-gmacko-app/packages/db/src/__tests__/schema.test.ts`](/Volumes/dev/create-gmacko-app/packages/db/src/__tests__/schema.test.ts)

**Steps:**
1. Write failing schema or router tests for workspace, membership, invite allowlist, and platform-role behavior.
2. Add explicit workspace and membership tables that remain future-friendly even while v1 exposes one workspace per user.
3. Keep platform admin roles separate from workspace roles in auth and router checks.
4. Add minimal settings/admin queries that expose the current workspace and role-aware controls.
5. Run schema and router tests, then commit with `feat: add workspace saas schema`.

## Task 5: Add Collaboration Layer

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/packages/db/src/schema.ts`](/Volumes/dev/create-gmacko-app/packages/db/src/schema.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts`](/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/(authenticated)/settings/page.tsx`](/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/(authenticated)/settings/page.tsx)
- Modify: [`/Volumes/dev/create-gmacko-app/apps/expo/src/app/settings.tsx`](/Volumes/dev/create-gmacko-app/apps/expo/src/app/settings.tsx)
- Test: [`/Volumes/dev/create-gmacko-app/packages/api/src/router/__tests__/settings.test.ts`](/Volumes/dev/create-gmacko-app/packages/api/src/router/__tests__/settings.test.ts)

**Steps:**
1. Write failing tests for invite-based collaboration flows.
2. Add invite tables and the minimal router procedures for listing invites, creating invites, and accepting invites.
3. Render collaboration sections only when the collaboration layer is selected.
4. Keep v1 UX single-workspace even though invites add members.
5. Run tests and commit with `feat: add collaboration scaffold layer`.

## Task 6: Add Billing, Limits, And Metering Primitives

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/packages/db/src/schema.ts`](/Volumes/dev/create-gmacko-app/packages/db/src/schema.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/billing/src/index.ts`](/Volumes/dev/create-gmacko-app/packages/billing/src/index.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts`](/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/(authenticated)/settings/page.tsx`](/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/(authenticated)/settings/page.tsx)
- Modify: [`/Volumes/dev/create-gmacko-app/apps/expo/src/app/settings.tsx`](/Volumes/dev/create-gmacko-app/apps/expo/src/app/settings.tsx)
- Test: [`/Volumes/dev/create-gmacko-app/packages/billing/src/__tests__/billing.test.ts`](/Volumes/dev/create-gmacko-app/packages/billing/src/__tests__/billing.test.ts)

**Steps:**
1. Write failing tests for plan lookup, limit enforcement helpers, and optional meter rollups.
2. Add explicit schema for plans, subscriptions, limits, and optional usage meters.
3. Keep the first billing model per-workspace and do not implement seat billing.
4. Expose customer-facing settings sections for billing and usage only when those options are selected.
5. Run billing and router tests, then commit with `feat: add billing limits and metering`.

## Task 7: Add Public Shell, Support, And Launch Controls

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/page.tsx`](/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/page.tsx)
- Modify: [`/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/layout.tsx`](/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/layout.tsx)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/db/src/schema.ts`](/Volumes/dev/create-gmacko-app/packages/db/src/schema.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/api/src/router/admin.ts`](/Volumes/dev/create-gmacko-app/packages/api/src/router/admin.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts`](/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts)
- Test: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Write failing tests for generated marketing/support surfaces and launch-control copy.
2. Add scaffolded routes or content for landing, pricing, FAQ, changelog, contact, privacy, and terms.
3. Add waitlist table shape, review actions, referral tracking, maintenance mode, signup toggle, and allowlist/domain settings in the admin model.
4. Make the public auth flow respect signup-disabled and invite-only behavior, with non-production auto-create and production waitlist fallback.
5. Run scaffold, router, and app tests, then commit with `feat: add support and launch control scaffold`.

## Task 8: Add Operator API, CLI, And MCP Refinements

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/packages/operator-core/src/index.ts`](/Volumes/dev/create-gmacko-app/packages/operator-core/src/index.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/trpc-cli/src/index.ts`](/Volumes/dev/create-gmacko-app/packages/trpc-cli/src/index.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/mcp-server/src/index.ts`](/Volumes/dev/create-gmacko-app/packages/mcp-server/src/index.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts)
- Test: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/e2e.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/e2e.test.ts)

**Steps:**
1. Write failing tests for OAuth login guidance, workspace-aware commands, and API-key lifecycle commands.
2. Expand the shared operator core so CLI and MCP remain wrappers around the same tRPC procedures.
3. Add scaffolded command docs for login, current workspace, API keys, usage, and limits.
4. Verify the operator lane remains optional and does not leak into default scaffolds.
5. Run operator build/tests and commit with `feat: deepen operator api lane`.

## Task 9: Add Shared Platform Primitives

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/packages/config/src/index.ts`](/Volumes/dev/create-gmacko-app/packages/config/src/index.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts`](/Volumes/dev/create-gmacko-app/packages/api/src/router/settings.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/api/src/router/admin.ts`](/Volumes/dev/create-gmacko-app/packages/api/src/router/admin.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/scripts/doctor.sh`](/Volumes/dev/create-gmacko-app/scripts/doctor.sh)
- Test: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Write failing tests for platform primitives such as feature flags, jobs, rate limits, signup bot protection, and compliance/export hooks.
2. Add minimal first-party scaffolding and configuration points for those primitives.
3. Keep vendor-backed layers conditional, for example `Resend`-backed notifications and email flows only when that integration exists.
4. Update `pnpm doctor` and scaffolded docs so missing provider setup is surfaced clearly.
5. Run the scaffold and doctor contract tests, then commit with `feat: add saas platform primitives`.

## Task 10: Final Docs And Verification Sweep

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/README.md)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/README.md)
- Modify: [`/Volumes/dev/create-gmacko-app/docs/ai/INITIAL_PROPOSAL.md`](/Volumes/dev/create-gmacko-app/docs/ai/INITIAL_PROPOSAL.md)
- Modify: [`/Volumes/dev/create-gmacko-app/docs/ai/IMPLEMENTATION_PLAN.md`](/Volumes/dev/create-gmacko-app/docs/ai/IMPLEMENTATION_PLAN.md)
- Modify: [`/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md`](/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md)

**Steps:**
1. Update maintainer and user-facing docs to describe the new SaaS scaffold options and their maturity.
2. Add cross-agent references for the generated AI workspace and follow-up skill workflows.
3. Run the normal verification baseline:
   - `pnpm --dir packages/create-gmacko-app build`
   - `pnpm vitest run src/__tests__/scaffold.test.ts`
   - `pnpm vitest run src/__tests__/provision.test.ts`
   - `pnpm vitest run src/__tests__/e2e.test.ts`
   - `pnpm format:check`
   - `pnpm lint:ox`
4. Commit with `docs: align saas scaffold plan`.
