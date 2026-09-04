# Migration execution briefs

Working notes from the TanStack + Effect + D1 migration
(`docs/plans/2026-09-02-tanstack-effect-d1-migration.html`, published at
https://ao98zs9lxlq2.postplan.dev). The HTML plan is the source of truth for
scope, decisions, and status; these are the per-phase task briefs the
implementation agents worked from, kept for archaeology.

All ten phases are complete. The only open plan row is the merge of
`migrate/tanstack-effect-d1` into `main`.

- `progress.md` — the per-phase log, including every review finding and how it was resolved
- `api-surface.md`, `auth-otlp-surface.md` — verified API notes for Effect 4 rc, Drizzle rc, better-auth 1.7.2, OTLP
- `api-inventory.md` — the 31 legacy tRPC procedures the contract was derived from
- `brief-phase-*.md`, `brief-finish-fixes.md` — the task briefs themselves
