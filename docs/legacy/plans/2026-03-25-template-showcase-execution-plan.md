# Template Showcase Execution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Turn `create-gmacko-app` into a flagship starter that feels better than generic T3-era scaffolds for modern AI-assisted SaaS teams across ForgeGraph, Cloudflare, and Expo/mobile workflows.

**Architecture:** Keep the stable default path opinionated: `jj`-friendly repo shape, ForgeGraph + Nix + colocated Postgres, and a polished first-run experience. Treat Cloudflare Workers and `vinext` as a separate maturity lane, and treat Expo as a first-class product surface rather than an optional sidecar. Use generated-app contract tests plus manual/full E2E as the enforcement mechanism for every change.

**Tech Stack:** Turborepo, pnpm, Next.js 16, Expo SDK 55, TanStack Start, `vinext`, Better Auth, Drizzle ORM, Postgres, ForgeGraph, Nix, `oxlint`, Biome, Lefthook, Vitest, GitHub Actions.

## Plan Rules

- Keep changes small and commit per task or per tightly related subtask.
- Add or update tests before implementation whenever behavior changes in the scaffold contract.
- Prefer editing generator inputs and tests together so the generated repo surface stays intentional.
- Keep active docs aligned in [`/Volumes/dev/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/README.md), [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/README.md), [`/Volumes/dev/create-gmacko-app/docs/ai/IMPLEMENTATION_PLAN.md`](/Volumes/dev/create-gmacko-app/docs/ai/IMPLEMENTATION_PLAN.md), and [`/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md`](/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md).
- Use the existing verification baseline after each task:
  - `pnpm --dir packages/create-gmacko-app build`
  - `pnpm vitest run src/__tests__/scaffold.test.ts`
  - `pnpm vitest run src/__tests__/provision.test.ts`
  - `pnpm vitest run src/__tests__/e2e.test.ts`
  - `pnpm format:check`
  - `pnpm lint:ox`

## Workstream 1: Make The Default Path Excellent

### Task 1: Finish adaptive first-run UX

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/README.md)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/README.md)

**Steps:**
1. Add failing scaffold tests for web-only, mobile-only, and Workers-enabled README profile output.
2. Extend the generated README profile block so recommended commands differ by selected platforms and `vinext`.
3. Update the scaffold outro so it matches the generated README language.
4. Re-run targeted scaffold tests, then the full scaffold suite.
5. Commit with a message like `feat: deepen adaptive scaffold onboarding`.

### Task 2: Improve generated env clarity

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/.env.example`](/Volumes/dev/create-gmacko-app/.env.example)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/scripts/doctor.sh`](/Volumes/dev/create-gmacko-app/scripts/doctor.sh)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Write tests asserting `.env.example` is grouped into core, web, mobile, ForgeGraph, and Cloudflare sections.
2. Add clearer sample values and comments for optional integrations and lane-specific env vars.
3. Teach `pnpm doctor` to report missing env groups more helpfully instead of only listing raw variable names.
4. Verify the generated `.env.example` still works for the default scaffold and `--vinext`.
5. Commit with a message like `feat: clarify generated env contracts`.

### Task 3: Add a guided local bootstrap handoff

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/scripts/bootstrap-local.sh`](/Volumes/dev/create-gmacko-app/scripts/bootstrap-local.sh)
- Modify: [`/Volumes/dev/create-gmacko-app/scripts/setup.sh`](/Volumes/dev/create-gmacko-app/scripts/setup.sh)
- Modify: [`/Volumes/dev/create-gmacko-app/scripts/doctor.sh`](/Volumes/dev/create-gmacko-app/scripts/doctor.sh)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Add a failing test that asserts the bootstrap script gives actionable follow-ups when Docker Compose or placeholder ForgeGraph config is missing.
2. Make `bootstrap-local.sh` print branch-specific next steps for Docker-missing, Postgres-not-running, and ForgeGraph-placeholder cases.
3. Keep the script non-destructive and idempotent.
4. Run scaffold tests and a local manual scaffold to verify the bootstrap path reads clearly.
5. Commit with a message like `feat: guide local bootstrap recovery`.

## Workstream 2: Tighten ForgeGraph Realism

### Task 4: Align `.forgegraph.yaml` with the live schema

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/index.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/index.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/types.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/types.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/deploy/forgegraph/README.md`](/Volumes/dev/create-gmacko-app/deploy/forgegraph/README.md)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)
- Reference: `../ForgeGraph` schema and CLI docs

**Steps:**
1. Inspect the current ForgeGraph schema and CLI expectations in `../ForgeGraph`.
2. Add failing scaffold tests for the desired `.forgegraph.yaml` shape and any new CLI flags needed to fill it.
3. Update scaffold generation and CLI option parsing to match the real schema instead of placeholders where safe.
4. Update deployment docs to mirror the exact generated schema and command flow.
5. Verify the generated repo still passes the fake-`forge` smoke path in CLI E2E.
6. Commit with a message like `feat: align forgegraph scaffold schema`.

### Task 5: Add generated deployment checklists

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts)
- Create: generated `docs/deploy/first-launch.md` via scaffold customization
- Modify: [`/Volumes/dev/create-gmacko-app/deploy/forgegraph/README.md`](/Volumes/dev/create-gmacko-app/deploy/forgegraph/README.md)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Add a failing test that asserts generated repos contain a concise first-launch checklist.
2. Generate a deployment checklist covering DNS, secrets, health routes, database migration, smoke verification, and rollback.
3. Link the generated README and ForgeGraph docs to the generated checklist.
4. Verify the checklist adapts to `vinext` and mobile-inclusive scaffolds where relevant.
5. Commit with a message like `feat: scaffold deployment launch checklists`.

## Workstream 3: Mature The Cloudflare Lane

### Task 6: Add a generated Cloudflare lane guide

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/deploy/cloudflare/README.md`](/Volumes/dev/create-gmacko-app/deploy/cloudflare/README.md)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Add a failing test for a generated app-local Cloudflare README when `--vinext` is enabled.
2. Generate a concise app-local guide describing `dev:vinext`, `build:vinext`, `deploy:cloudflare:*`, required env, and experimental support status.
3. Keep the root docs high-level and let the app-local guide carry lane-specific steps.
4. Verify the file is absent when `--vinext` is not selected.
5. Commit with a message like `feat: add generated cloudflare lane guide`.

### Task 7: Define integration compatibility for Workers

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md`](/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md)
- Modify: [`/Volumes/dev/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/README.md)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/README.md)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Audit the current optional integrations against the `vinext` lane and categorize them as stable, unsupported, or experimental.
2. Encode that support matrix in docs and scaffold guidance.
3. Add tests that prevent drift back to vague Cloudflare claims.
4. Verify the docs still align with generated scripts and env requirements.
5. Commit with a message like `docs: define workers integration support matrix`.

## Workstream 4: Make Expo A Real Product Starter

### Task 8: Improve mobile app identity and release scaffolding

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/apps/expo/app.config.ts`](/Volumes/dev/create-gmacko-app/apps/expo/app.config.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/apps/expo/README.md`](/Volumes/dev/create-gmacko-app/apps/expo/README.md)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Add failing tests for deep link domains, explicit app identifier comments, and environment-specific app naming.
2. Extend scaffold-time Expo rewriting to include app display name, deep-link placeholders, and stage-aware comments.
3. Expand Expo docs for development builds, Orbit, auth callback URLs, and release build expectations.
4. Verify generated Expo config stays valid for default and mobile-only scaffolds.
5. Commit with a message like `feat: enrich expo release scaffolding`.

### Task 9: Add mobile QA and store-readiness checklists

**Files:**
- Create: generated `apps/expo/docs/mobile-qa.md` via scaffold customization
- Modify: [`/Volumes/dev/create-gmacko-app/apps/expo/README.md`](/Volumes/dev/create-gmacko-app/apps/expo/README.md)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Add a failing test for a generated mobile QA checklist.
2. Generate a short checklist covering dev-client install, sign-in callback flow, push setup, deep links, release build, and store metadata review.
3. Link the Expo README to that checklist.
4. Verify the checklist is only generated when Expo is included.
5. Commit with a message like `feat: scaffold mobile qa checklist`.

## Workstream 5: Make The Repo AI-Native

### Task 10: Add generated agent quickstarts

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/AGENTS.md`](/Volumes/dev/create-gmacko-app/AGENTS.md)
- Modify: [`/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md`](/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Add a failing test for a generated “agent quickstart” section in scaffolded READMEs.
2. Generate a short agent section that points at `AGENTS.md`, `.mcp.json`, `.claude/settings.json`, and `opencode.json`.
3. Keep agent-specific detail in shared docs, not in multiple duplicated files.
4. Verify the quickstart still reads correctly when `--no-ai` is used.
5. Commit with a message like `feat: add generated agent quickstart`.

### Task 11: Add reusable repo-maintainer prompts and workflows

**Files:**
- Create: [`/Volumes/dev/create-gmacko-app/docs/ai/MAINTAINER_PROMPTS.md`](/Volumes/dev/create-gmacko-app/docs/ai/MAINTAINER_PROMPTS.md)
- Modify: [`/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md`](/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md)
- Modify: [`/Volumes/dev/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/README.md)

**Steps:**
1. Document a small prompt library for scaffold debugging, release audits, framework upgrades, and deployment checks.
2. Keep prompts grounded in repo commands and current docs rather than generic AI advice.
3. Link the prompt library from maintainer-facing docs only.
4. Run docs format/lint checks and commit with `docs: add maintainer prompt library`.

## Workstream 6: Turn The Template Into A Showcase

### Task 12: Add a demo/business-mode scaffold

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/prompts.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/prompts.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/types.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/types.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/scaffold.ts)
- Modify: [`/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/page.tsx`](/Volumes/dev/create-gmacko-app/apps/nextjs/src/app/page.tsx)
- Modify: [`/Volumes/dev/create-gmacko-app/apps/expo/src/app/index.tsx`](/Volumes/dev/create-gmacko-app/apps/expo/src/app/index.tsx)
- Modify: [`/Volumes/dev/create-gmacko-app/apps/tanstack-start/src/routes/index.tsx`](/Volumes/dev/create-gmacko-app/apps/tanstack-start/src/routes/index.tsx)
- Modify: [`/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts`](/Volumes/dev/create-gmacko-app/packages/create-gmacko-app/src/__tests__/scaffold.test.ts)

**Steps:**
1. Decide on one showcase-friendly default business domain and document the decision in [`/Volumes/dev/create-gmacko-app/docs/ai/INITIAL_PROPOSAL.md`](/Volumes/dev/create-gmacko-app/docs/ai/INITIAL_PROPOSAL.md).
2. Add a prompt or flag that toggles between generic scaffold copy and the showcase mode.
3. Update the app entry screens so the showcase mode feels coherent across web and mobile.
4. Add scaffold tests asserting the selected mode rewrites the generated copy.
5. Commit with a message like `feat: add showcase demo scaffold mode`.

### Task 13: Rebuild the landing README for adoption

**Files:**
- Modify: [`/Volumes/dev/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/README.md)
- Modify: [`/Volumes/dev/create-gmacko-app/docs/ai/INITIAL_PROPOSAL.md`](/Volumes/dev/create-gmacko-app/docs/ai/INITIAL_PROPOSAL.md)
- Modify: [`/Volumes/dev/create-gmacko-app/docs/ai/IMPLEMENTATION_PLAN.md`](/Volumes/dev/create-gmacko-app/docs/ai/IMPLEMENTATION_PLAN.md)

**Steps:**
1. Rewrite the README top section around personas, decision paths, and what makes this template different from generic starters.
2. Add a short comparison section against T3, `create-next-app`, `create-t3-turbo`, and generic Expo starters.
3. Keep claims evidence-backed and grounded in actual repo behavior.
4. Run docs checks and commit with `docs: reposition template landing page`.

## Workstream 7: Trust, Release, And Maintenance

### Task 14: Add a support and compatibility matrix

**Files:**
- Create: [`/Volumes/dev/create-gmacko-app/docs/COMPATIBILITY_MATRIX.md`](/Volumes/dev/create-gmacko-app/docs/COMPATIBILITY_MATRIX.md)
- Modify: [`/Volumes/dev/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/README.md)
- Modify: [`/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md`](/Volumes/dev/create-gmacko-app/docs/ai/DEVELOPER_EXPERIENCE.md)

**Steps:**
1. Document supported Node, pnpm, Next.js, Expo, TanStack Start, ForgeGraph, and Cloudflare lane expectations.
2. Call out which lanes are stable versus experimental.
3. Link the matrix from the README and maintainer docs.
4. Commit with `docs: add compatibility matrix`.

### Task 15: Add scheduled maintenance playbooks

**Files:**
- Create: [`/Volumes/dev/create-gmacko-app/docs/MAINTENANCE.md`](/Volumes/dev/create-gmacko-app/docs/MAINTENANCE.md)
- Modify: [`/Volumes/dev/create-gmacko-app/.github/workflows/ci.yml`](/Volumes/dev/create-gmacko-app/.github/workflows/ci.yml)
- Modify: [`/Volumes/dev/create-gmacko-app/.github/workflows/cli-e2e.yml`](/Volumes/dev/create-gmacko-app/.github/workflows/cli-e2e.yml)
- Modify: [`/Volumes/dev/create-gmacko-app/README.md`](/Volumes/dev/create-gmacko-app/README.md)

**Steps:**
1. Document monthly and release-cycle maintenance tasks for Next.js, Expo, TanStack Start, Cloudflare, and ForgeGraph drift.
2. Add CI comments or scheduled jobs only where they materially support that cadence.
3. Link the playbook from maintainer docs instead of leaving it tribal.
4. Commit with `docs: add maintenance playbook`.

## Recommended Execution Order

1. Task 4: align `.forgegraph.yaml` with the live schema.
2. Task 2: improve generated env clarity.
3. Task 3: add guided local bootstrap recovery.
4. Task 6: add generated Cloudflare lane guide.
5. Task 8: improve mobile app identity and release scaffolding.
6. Task 10: add generated agent quickstarts.
7. Task 13: rebuild the landing README for adoption.
8. Task 12: add a showcase demo mode.
9. Task 14 and Task 15: publish support and maintenance contracts.

## Definition Of Done

This template is ready to call a showcase starter when all of the following are true:

- a new repo can scaffold, bootstrap, and pass the default smoke path without tribal knowledge
- the ForgeGraph lane looks first-class and current, not placeholder-driven
- the Cloudflare lane is explicitly documented by maturity and support level
- Expo feels product-ready, including release and QA guidance
- the landing docs explain who this starter is for and why it is different
- the repo has a clear support, maintenance, and compatibility story

## Verification Gate For Each Batch

After each task or tightly scoped pair of tasks, run:

```bash
pnpm --dir packages/create-gmacko-app build
pnpm vitest run src/__tests__/scaffold.test.ts
pnpm vitest run src/__tests__/provision.test.ts
pnpm vitest run src/__tests__/e2e.test.ts
pnpm format:check
pnpm lint:ox
```
