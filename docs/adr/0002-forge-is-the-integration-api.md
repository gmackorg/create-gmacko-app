# ADR 0002: Forge is the integration API

- Status: Accepted (2026-10-09)
- Supersedes, for partner integrations only: the "one contract is the Effect HttpApi" line in [ADR 0001](./0001-tanstack-effect-d1.md)

## Decision

New apps declare the API other businesses call in Forge, in [`forge/`](../../forge). `forgec` 0.5.0 emits the ForgeGraph contract, OpenAPI 3.1, and a TypeScript client from that package. The walkthrough is [docs/INTEGRATE.md](../INTEGRATE.md).

The web Worker keeps serving the Effect `HttpApi` at `/api/*` for auth, settings, admin, launch, and health. [ADR 0003](./0003-forge-hosts-the-product-api.md) hosts this package on the Forge runtime and points the product screens at it. `@forgegraph/runtime` 0.5.0 is vendored in the template because that version is not published yet.

## Consequences

- A new partner-facing operation is a Forge resource or `@http` function, then `pnpm forge:api`.
- Effect endpoints in `packages/domain` stay the in-app API for auth, settings, admin, launch, and health. The product records are the Forge package.
- Scaffolded apps copy `forge/` with the rest of the template. The README profile names Forge as the integration API.
