---
name: create-gmacko-app-workflow
description: Use when working inside a repo generated from create-gmacko-app or when the repo has apps/web, packages/domain, packages/ui, docs/ai, and vendored gstack workflows - explains the standard monorepo layout (TanStack Start + Effect HttpApi on Cloudflare Workers with D1), Storybook-first React UI workflow, planning artifact locations, and how Bob or Claude should scope work in these template-based repos
---

# Create Gmacko App Workflow

## Overview

This repo follows the create-gmacko-app template. Treat the layout as standardized, not bespoke.

The web app is one Cloudflare Worker: TanStack Start renders and routes, an Effect `HttpApi` serves `/api/*`, and Cloudflare D1 is the database. The contract, the services, and the client are separate packages, and every consumer (browser, SSR loader, Expo, operator CLI/MCP) goes through the same typed client.

The main rule is to map work to the correct layer first, then operate within that layer instead of scattering edits across the monorepo.

## When to Use

- The repo contains `apps/web`, `packages/domain`, `packages/ui`, and `docs/ai`
- `CLAUDE.md` references vendored `gstack`
- The task involves React UI, planning artifacts, shared packages, or Bob-style execution inside a generated app

## Quick Reference

| Need | Primary location |
| --- | --- |
| Web app routes, loaders, app-shell UI | `apps/web/src/routes` (TanStack Start) |
| Worker entry, runtime services, config | `apps/web/src/server` (`worker.ts`, `runtime.ts`, `config.ts`) |
| API contract: endpoints, schemas, security middleware declarations | `packages/domain` (`src/<group>/api.ts`, `models.ts`) |
| API implementation: Effect services and handlers | `packages/api` (`src/<group>/service.ts`, `handlers.ts`) |
| Typed client, TanStack Query `queries`/`mutations` | `packages/api-client` |
| DB schema, D1 migrations, seed data | `packages/db` (`src/schema.ts`, `migrations/*.sql`, `seed/`) |
| Auth (better-auth), sessions, API keys | `packages/auth` |
| Shared design system and stories | `packages/ui` |
| Mobile app | `apps/expo` |
| Product shaping and planning artifacts | `docs/ai` |
| Claude slash commands | `.claude/skills/gstack` |

## Standard Workflow

1. Shape product direction in `docs/ai/INITIAL_PROPOSAL.md`.
2. Turn approved scope into `docs/ai/IMPLEMENTATION_PLAN.md`.
3. Keep `DESIGN.md` aligned with the product and UI direction.
4. For a new capability: add the endpoint to `packages/domain` first (schemas, credential), then the service and handler in `packages/api`, then the query or mutation in `packages/api-client`, then the route in `apps/web` (and the screen in `apps/expo`).
5. For React UI work, use Storybook (`pnpm --filter @gmacko/ui storybook`) before page-level integration.
6. Keep shared components in `packages/ui` unless the code is app-specific.
7. Schema changes: edit `packages/db/src/schema.ts`, run `pnpm db:generate`, review the SQL for `__new_` table rebuilds (forbidden on D1), then `pnpm db:migrate:local`.

## Rules the standards check enforces

`pnpm check:standards` runs in CI and `pnpm check:fast`; `AGENTS.md` lists every rule.

- Data reads and writes go through the contract client; `createServerFn` only sets cookies or redirects and lives in `apps/web/src/server/actions.ts`.
- Every non-public endpoint declares exactly one credential (`Session` or `SessionOrKey(scope)`), after any role check.
- No `db.transaction` / `withTransaction`: use `Database.batch` or a guarded `updateWhere`.
- No `process.env` in anything that ships in the Worker bundle; `AppConfig` is the only reader of bindings, and only `runtime.ts` imports `cloudflare:workers`.
- Never create `apps/web/.dev.vars`; D1 migrations are expand/contract only.

## React UI Rules

- Shared components belong in `packages/ui`
- Shared component stories belong in `packages/ui/src/**/*.stories.tsx`
- App-specific wiring, routes, loaders, and providers belong in `apps/web`
- Prefer Storybook-driven state coverage for shared UI changes before wiring live data

## Bob-Specific Guidance

When Bob is planning or executing work in this repo:

- Write work items against the correct layer, not vague app-level buckets
- Split feature tasks into contract work (`packages/domain`), service work (`packages/api`), client work (`packages/api-client`), shared-component work (`packages/ui`), and integration work (`apps/web`, `apps/expo`) when more than one is needed
- For React frontend tasks, include Storybook states, edge cases, and realistic fixture expectations in the task description
- Keep planning artifacts and implementation work consistent with `docs/ai`

## Common Mistakes

- Editing `apps/web` for a component that should live in `packages/ui`
- Fetching data in a route with `createServerFn` or a hand-written `fetch` instead of `@gmacko/api-client`
- Adding an endpoint to `packages/api` without declaring it (and its credential) in `packages/domain`
- Treating `docs/ai` as optional instead of the planning source of truth
- Adding page-specific assumptions into shared UI components
- Skipping Storybook coverage for reusable React components
- Mixing contract, service, DB, and UI edits into a single task without clear acceptance criteria

## Example

If the user asks for a new billing settings page:

- Plan the product and acceptance criteria in `docs/ai`
- Declare the endpoints and payload schemas in `packages/domain/src/settings/api.ts`
- Implement the service and handlers in `packages/api/src/settings`
- Expose `queries.settings.*` / `mutations.settings.*` in `packages/api-client`
- Put reusable form controls or status cards in `packages/ui`
- Put the route, loader, and app wiring in `apps/web/src/routes`
- Update stories for shared components before landing the integration work
