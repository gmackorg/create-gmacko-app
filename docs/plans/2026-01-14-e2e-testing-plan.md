# ForgeGraph E2E Testing Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Keep E2E testing in the template focused on real user-critical flows with deterministic data, simple Postgres isolation, and deployment assumptions that match ForgeGraph-managed environments.

**Architecture:** Treat E2E as layered confidence checks rather than infrastructure theater. Fast smoke coverage should protect pull requests, broader regression coverage should run on the mainline and release paths, and both layers should share the same generic app URL, auth, and database contracts used by local development and early-stage production.

**Tech Stack:** Playwright, Maestro, Vitest for supporting config coverage, Postgres seed scripts, Docker Compose, ForgeGraph preview handoff workflow, Better Auth.

## Testing Strategy

### Tier 1: Pull Request Smoke Coverage

- Exercise core auth, navigation, and one business-critical success path per app surface.
- Run against deterministic seed data.
- Prefer schema isolation or a dedicated preview database only when the smoke suite cannot safely share state.

### Tier 2: Mainline Regression Coverage

- Expand to destructive and cross-surface flows once smoke coverage is stable.
- Reuse the same fixtures and env contract as pull request runs.
- Keep failures actionable by avoiding large all-in-one suites that hide which user path broke.

## Environment Assumptions

1. Local and early-stage environments use Postgres deployed alongside the app.
2. Preview environments, if needed, are modeled in ForgeGraph with schema isolation or a dedicated preview database when truly necessary.
3. CI validates real app behavior without relying on hidden provider lifecycle automation.
4. Test URLs and preview metadata flow through `APP_URL` and `PREVIEW_*` style configuration rather than platform-specific host variables.

## Required Supporting Pieces

- Reliable seed scripts that can run repeatedly.
- A narrow test-auth path only when standard auth is too expensive or flaky for CI.
- Health/readiness endpoints that let CI wait on the real app state.
- Documentation that explains how preview URLs and preview database choices map into ForgeGraph.

## Verification

Changes in this area should verify:

1. The smoke path can run locally against Docker Compose Postgres.
2. The documented preview strategy matches the ForgeGraph handoff docs.
3. Generated apps do not reintroduce provider-specific environment detection.
4. Tests and docs still point engineers toward simple Postgres-first isolation before hosted complexity.

## Archive

The earlier planning document now lives at [`/Volumes/dev/create-gmacko-app/docs/legacy/plans/2026-01-14-e2e-testing-plan.md`](/Volumes/dev/create-gmacko-app/docs/legacy/plans/2026-01-14-e2e-testing-plan.md).
