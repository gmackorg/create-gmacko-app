# Post-setup SaaS bootstrap

Run this after `pnpm bootstrap:local`.

## Claude-only

- Claude-only: run `/office-hours` to force clarity on customer, problem, and wedge.
- Claude-only: if your user-level gstack install includes `/autoplan`, run it next.
- Claude-only: run `/design-consultation` once the product direction is clear so `DESIGN.md` becomes the visual source of truth.
- Claude-only: use `/bootstrap-expo-app` and `/test-mobile-with-maestro` for the Expo lane.

## Codex

- Start from `AGENTS.md` and `docs/ai/IMPLEMENTATION_PLAN.md`.
- Run `pnpm bootstrap:local`, then `pnpm run doctor` and `pnpm check:fast`.
- If collaboration or invites are enabled, inspect `packages/db/src/schema.ts`, `packages/domain/src/settings/api.ts` (the contract) and `packages/api/src/settings/service.ts` + `packages/api/src/settings/handlers.ts` (the `Workspaces` service and its handlers).
- If billing or metering are enabled, inspect `packages/billing`, `packages/domain/src/settings/api.ts` and `packages/api/src/settings/billing.ts`.
- If support or launch controls are enabled, inspect `apps/web/src/routes`, `packages/domain/src/admin/api.ts`, and `packages/api/src/admin/service.ts`.

## OpenCode

- Start from `AGENTS.md`, `opencode.json`, and `docs/ai/IMPLEMENTATION_PLAN.md`.
- Run `pnpm bootstrap:local`, then `pnpm run doctor` and `pnpm check:fast`.
- If collaboration or invites are enabled, inspect `packages/db/src/schema.ts`, `packages/domain/src/settings/api.ts` (the contract) and `packages/api/src/settings/service.ts` + `packages/api/src/settings/handlers.ts` (the `Workspaces` service and its handlers).
- If billing or metering are enabled, inspect `packages/billing`, `packages/domain/src/settings/api.ts` and `packages/api/src/settings/billing.ts`.
- If support or launch controls are enabled, inspect `apps/web/src/routes`, `packages/domain/src/admin/api.ts`, and `packages/api/src/admin/service.ts`.

## Selected SaaS layers

- No optional SaaS layers selected yet. Start with the core workspace bootstrap flow, then add only the layers that the product needs.
