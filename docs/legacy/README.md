# Legacy notes

Everything in this directory describes the stack that was replaced by the
TanStack Start + Effect + D1 migration (`docs/adr/0001-tanstack-effect-d1.md`).
Nothing here applies to the current web lane; it is kept for history and for
anyone still running an app generated from the old template.

- `PLAN.md` — the original template plan.
- `deployment-guide.md` — the old deployment guide.
- `ai/IMPLEMENTATION_PLAN.md` — the previous placeholder implementation plan.
- `plans/2026-01-14-e2e-testing-plan.md`, `plans/2026-01-14-e2e-implementation.md`
  — the E2E testing plans written against the old web app.
- `plans/2026-03-25-template-showcase-*.md`, `plans/2026-03-27-saas-scaffold-implementation.md`
  — the SaaS scaffold roadmap and implementation plan (tRPC routers, Next.js pages).
- `plans/2026-04-29-emulate-portless-design.md` — the emulate + portless design;
  its Postgres/Redis emulators are no longer started (the web lane runs on D1).
- `plans/2026-05-06-otel-*.md` — the OTel design for the Node runtime (tRPC
  middleware, pino); the Worker exports through `effect/unstable/observability`.

The recipe for moving an existing database from the old stack to D1 is a
Phase 9 deliverable of `docs/plans/2026-09-02-tanstack-effect-d1-migration.html`
and is not documented here yet.
