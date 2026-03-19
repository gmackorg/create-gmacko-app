---
name: create-gmacko-app-workflow
description: Use when working inside a repo generated from create-gmacko-app or when the repo has apps/nextjs, packages/ui, docs/ai, and vendored gstack workflows - explains the standard monorepo layout, Storybook-first React UI workflow, planning artifact locations, and how Bob or Claude should scope work in these template-based repos
---

# Create Gmacko App Workflow

## Overview

This repo follows the create-gmacko-app template. Treat the layout as standardized, not bespoke.

The main rule is to map work to the correct layer first, then operate within that layer instead of scattering edits across the monorepo.

## When to Use

- The repo contains `apps/nextjs`, `packages/ui`, and `docs/ai`
- `CLAUDE.md` references vendored `gstack`
- The task involves React UI, planning artifacts, shared packages, or Bob-style execution inside a generated app

## Quick Reference

| Need | Primary location |
| --- | --- |
| Web app routes and app-shell UI | `apps/nextjs` |
| Shared design system and stories | `packages/ui` |
| Backend routers and server logic | `packages/api` |
| DB schema, migrations, seed data | `packages/db` |
| Product shaping and planning artifacts | `docs/ai` |
| Claude slash commands | `.claude/skills/gstack` |

## Standard Workflow

1. Shape product direction in `docs/ai/INITIAL_PROPOSAL.md`.
2. Turn approved scope into `docs/ai/IMPLEMENTATION_PLAN.md`.
3. Keep `DESIGN.md` aligned with the product and UI direction.
4. For React UI work, use Storybook before page-level integration.
5. Keep shared components in `packages/ui` unless the code is app-specific.

## React UI Rules

- Shared components belong in `packages/ui`
- Shared component stories belong in `packages/ui/src/**/*.stories.tsx`
- App-specific wiring, routes, and providers belong in `apps/nextjs`
- Prefer Storybook-driven state coverage for shared UI changes before wiring live data

## Bob-Specific Guidance

When Bob is planning or executing work in this repo:

- Write work items against the correct layer, not vague app-level buckets
- Split UI tasks into shared-component work (`packages/ui`) and integration work (`apps/nextjs`) when both are needed
- For React frontend tasks, include Storybook states, edge cases, and realistic fixture expectations in the task description
- Keep planning artifacts and implementation work consistent with `docs/ai`

## Common Mistakes

- Editing `apps/nextjs` for a component that should live in `packages/ui`
- Treating `docs/ai` as optional instead of the planning source of truth
- Adding page-specific assumptions into shared UI components
- Skipping Storybook coverage for reusable React components
- Mixing API, DB, and UI edits into a single task without clear acceptance criteria

## Example

If the user asks for a new billing settings page:

- Plan the product and acceptance criteria in `docs/ai`
- Put reusable form controls or status cards in `packages/ui`
- Put the route, data fetching, and app wiring in `apps/nextjs`
- Update stories for shared components before landing the integration work
