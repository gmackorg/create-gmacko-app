# Post-setup SaaS bootstrap

Run this after `pnpm bootstrap:local`.

## Claude-only

- Claude-only: run `/office-hours` to force clarity on customer, problem, and wedge.
- Claude-only: if your user-level gstack install includes `/autoplan`, run it next.
- Claude-only: run `/design-consultation` once the product direction is clear so `DESIGN.md` becomes the visual source of truth.
- Claude-only: use `/bootstrap-expo-app` and `/test-mobile-with-maestro` for the Expo lane.

## Codex

- Start from `AGENTS.md` and `docs/ai/IMPLEMENTATION_PLAN.md`.
- Run `pnpm bootstrap:local`, then `pnpm doctor` and `pnpm check:fast`.
- If collaboration or invites are enabled, inspect `packages/db/src/schema.ts` and `packages/api/src/router/settings.ts`.
- If billing or metering are enabled, inspect `packages/billing` and `packages/api/src/router/settings.ts`.
- If support or launch controls are enabled, inspect `apps/nextjs/src/app`, `packages/api/src/router/admin.ts`, and `packages/api/src/router/settings.ts`.

## OpenCode

- Start from `AGENTS.md`, `opencode.json`, and `docs/ai/IMPLEMENTATION_PLAN.md`.
- Run `pnpm bootstrap:local`, then `pnpm doctor` and `pnpm check:fast`.
- If collaboration or invites are enabled, inspect `packages/db/src/schema.ts` and `packages/api/src/router/settings.ts`.
- If billing or metering are enabled, inspect `packages/billing` and `packages/api/src/router/settings.ts`.
- If support or launch controls are enabled, inspect `apps/nextjs/src/app`, `packages/api/src/router/admin.ts`, and `packages/api/src/router/settings.ts`.

## Selected SaaS layers

- No optional SaaS layers selected yet. Start with the core workspace bootstrap flow, then add only the layers that the product needs.
