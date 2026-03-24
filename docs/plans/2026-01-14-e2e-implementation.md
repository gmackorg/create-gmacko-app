# ForgeGraph E2E Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Define the current implementation shape for end-to-end infrastructure so generated apps can run reliable E2E coverage with ForgeGraph-managed environments and standard Postgres isolation strategies.

**Architecture:** E2E infrastructure should stay boring by default. Local and early-stage CI environments should reuse the same Postgres-first operating model as the app, with deterministic seeds, explicit preview metadata, and deployment assumptions passed through generic ForgeGraph-oriented contracts instead of provider-specific branching automation.

**Tech Stack:** Playwright, Maestro, GitHub Actions, Docker Compose, Postgres, Better Auth test-only helpers when required, ForgeGraph handoff workflow and deployment docs.

## Scope

This plan covers how the template should shape E2E infrastructure, not the complete contents of each future workflow.

## Implementation Tasks

### 1. Test Environment Contracts

- Keep test env variables generic: `DATABASE_URL`, `APP_URL`, `PREVIEW_*`, `E2E_TESTING`.
- Ensure preview metadata comes from shared config helpers rather than CI-provider env names.
- Document the minimum env contract in the app-facing deployment handoff docs.

### 2. Database Strategy

- Default local and CI setup to standard Postgres instances or schema isolation.
- Use deterministic seed scripts that can be rerun safely.
- Introduce stronger isolation only when a concrete workload demands it, such as high parallelism or destructive integration coverage.

### 3. CI and Preview Integration

- Keep preview orchestration expressed as ForgeGraph handoff steps.
- Avoid shipping bespoke deployment implementations inside GitHub Actions beyond build/test coordination and handoff metadata.
- Ensure preview and E2E workflows can agree on URL and database inputs without hidden provider logic.

### 4. App-Level E2E Hooks

- Keep test-only auth minimal and explicit.
- Avoid broad production-code branching for tests when narrow helpers or fixtures will do.
- Ensure health checks and app readiness endpoints stay generic enough for local Docker, ForgeGraph preview, and production deployments.

## Verification

When this area changes, verify:

1. Web and mobile E2E docs still reflect the same env contract.
2. Preview configuration helpers remain provider-agnostic.
3. Scaffold tests still reject stale deployment assets and legacy env hooks.
4. New docs describe real execution paths that match the current ForgeGraph/Postgres model.

## Archive

The earlier implementation plan now lives at [`/Volumes/dev/create-gmacko-app/docs/legacy/plans/2026-01-14-e2e-implementation.md`](/Volumes/dev/create-gmacko-app/docs/legacy/plans/2026-01-14-e2e-implementation.md).
