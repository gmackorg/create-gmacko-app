# ADR 0002: Forge is the integration API

- Status: Accepted (2026-10-09)
- Supersedes, for partner integrations only: the "one contract is the Effect HttpApi" line in [ADR 0001](./0001-tanstack-effect-d1.md)

## Decision

New apps declare the API other businesses call in Forge, in [`forge/`](../../forge). `forgec` 0.5.0 emits the ForgeGraph contract, OpenAPI 3.1, and a TypeScript client from that package. The walkthrough is [docs/INTEGRATE.md](../INTEGRATE.md).

The web Worker keeps serving the Effect `HttpApi` at `/api/*` for the browser, the SSR loader, and Expo. That implementation is not the partner contract. A later change hosts `forge/` on the Forge runtime and points those clients at it. This decision does not do that cutover: `@forgegraph/runtime` 0.5.0 is not the published Worker runtime yet.

## Consequences

- A new partner-facing operation is a Forge resource or `@http` function, then `pnpm forge:api`.
- Effect endpoints in `packages/domain` stay the in-app API until the cutover.
- Scaffolded apps copy `forge/` with the rest of the template. The README profile names Forge as the integration API.
