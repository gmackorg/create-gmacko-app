# Package Extraction Strategy

This document details which `@gmacko/*` packages could be extracted into
standalone npm packages, the order in which to do it, and the exact steps
for each.

## Why Extract?

Extracted packages give us:
- **Reuse across projects** — install from npm instead of copy-pasting
- **Independent versioning** — fix a bug in logging without releasing the
  whole template
- **Smaller template footprint** — new projects start lighter
- **Community contributions** — standalone packages are easier to contribute to

## Constraint: the Worker bundle

Any package `apps/web` depends on ships inside the Cloudflare Worker. An
extracted package that stays on that path must keep the same rules the
workspace version follows (`pnpm check:standards`): no `process.env` reads
(configuration arrives as options), no `node:` imports, and Effect services
where the workspace version exposes one.

## Extraction Tiers

### Tier 1: Extract Now (zero project-specific coupling)

These packages have no dependency on project-specific schema or business
logic. Where they import `@gmacko/config`, it is for a boolean flag that can
be replaced with a constructor argument.

| Package | Standalone Name | Current Deps | Decoupling Work |
|---------|----------------|--------------|-----------------|
| `@gmacko/logging` | `@gmacko/saas-logger` | none | Already standalone (Effect logger, JSON console output). Publish. |
| `@gmacko/telemetry` | `@gmacko/saas-telemetry` | `@gmacko/logging` | Depends on the published logger; OTLP layers over `effect/unstable/observability`. |
| `@gmacko/monitoring` | `@gmacko/saas-monitoring` | `@gmacko/config` (for `integrations.sentry`) | Replace with `initSentry({ enabled: boolean, ...config })` factory. |
| `@gmacko/analytics` | `@gmacko/saas-analytics` | `@gmacko/config` (for `integrations.posthog`) | Replace with `initAnalytics({ enabled: boolean, ...config })` factory. |
| `@gmacko/flags` | `@gmacko/feature-flags` | None (only React as peer dep) | Already standalone. Just publish. |
| `@gmacko/billing` | `@gmacko/billing` | None | Pure plan/limit/meter logic. Publish as-is. |

**Extraction Steps (per package):**

```
1. Create a new repo: github.com/gmackorg/<package-name>
2. Copy src/, package.json, tsconfig.json
3. Replace `import { integrations } from "@gmacko/config"` with a config
   parameter on the factory function
4. Add README, LICENSE, CHANGELOG
5. Set up changesets for versioning
6. Publish to npm under @gmacko/ scope
7. In the monorepo template, replace the workspace dependency:
     "@gmacko/logging": "workspace:*"  →  "@gmacko/saas-logger": "^1.0.0"
8. Keep the workspace package as a thin re-export wrapper:
     // packages/logging/src/index.ts
     export * from "@gmacko/saas-logger";
   This preserves all existing import paths.
```

### Tier 2: Extract with Adapter Pattern (light coupling)

These packages import project internals but can be decoupled by accepting
a store/provider interface instead of importing it directly.

| Package | Coupling Point | Adapter Strategy |
|---------|---------------|-----------------|
| `@gmacko/email` | `@gmacko/config` for provider flag, `@gmacko/logging` | Accept `{ provider: "resend", apiKey, baseUrl? }` in the constructor. Templates stay in the package (generic SaaS emails). |
| `@gmacko/payments` | `@gmacko/config`, `@gmacko/logging` | Accept `StripeConfig` (already supports `host`/`protocol`/`port`); keep the fetch HTTP client and SubtleCrypto webhook verification so it stays Worker-safe. |
| `@gmacko/storage` | `@gmacko/config` for provider flag | Accept `{ provider: "uploadthing", token }` in the constructor. |
| `@gmacko/realtime` | `@gmacko/config`, `@gmacko/logging` | Node-only (ioredis + BullMQ). Accept `{ redisUrl }`; never part of the Worker bundle. |
| `@gmacko/api-client` | `@gmacko/domain` | Already generic over the contract: `makeApiClient(api, options)` and the query layer depend on the `HttpApi` type only. Could ship as a generator over any Effect `HttpApi`. |
| `@gmacko/operator-core` | `@gmacko/api-client`, `@gmacko/domain` | Generic operator commands over a client; accept the client instead of building one. |

**Extraction Steps (per package):**

```
1. Define the adapter interface (e.g., EmailTransport, ObjectStore)
2. Create a default in-memory implementation
3. Create the provider adapter as a separate export:
     import { ResendTransport } from "@gmacko/email/resend"
4. The factory (or Layer) accepts the adapter:
     const email = Email.layer({ transport: ResendTransport(config) })
5. Publish, then update the monorepo to use the published version
```

### Tier 3: Stay In-Project (too coupled to project schema)

These packages are inherently project-specific. Extracting them would
create more complexity than value.

| Package | Why It Stays |
|---------|-------------|
| `@gmacko/domain` | The app's own `HttpApi` contract: groups, models, errors, security declarations. Every project's contract is different; the *pattern* (one contract, generated client and docs) is the reusable part. |
| `@gmacko/api` | Effect services and handlers implementing that contract. |
| `@gmacko/db` | Project-specific D1 schema, migrations, seed data. The `Database` service (`batch`, `updateWhere`, `first`, `DatabaseError`) is reusable in shape but tied to the schema. |
| `@gmacko/auth` | Depends on the auth tables and the contract's security middleware; OAuth provider config is project-specific. |
| `@gmacko/settings` | Depends on the project-specific `user_preferences` schema. |
| `@gmacko/purchases` | RevenueCat wiring tied to the app's products. |
| `@gmacko/notifications` | Expo-specific, tied to `app.config.ts` EAS project IDs. |
| `@gmacko/config` | Project-specific integration flags. However, the *pattern* (a typed integrations object) should be documented as a best practice. |
| `@gmacko/ui` | shadcn components are already individually installable via `npx shadcn add`. No need for a separate package. |
| `@gmacko/i18n` | Message files are project-specific; the wiring is too thin to warrant a package. |
| `@gmacko/api-cli`, `@gmacko/mcp-server` | Wrappers over the project's contract through `operator-core`; published as CLI tools from this repo (`pnpm release`). |

## Extraction Priority Order

1. **`@gmacko/saas-logger`** — zero deps, used by everything else
2. **`@gmacko/saas-telemetry`** — pairs with the logger; OTLP on Workers is the differentiator
3. **`@gmacko/feature-flags`** — already standalone, just needs publishing
4. **`@gmacko/billing`** — pure logic, common B2B need
5. **`@gmacko/saas-monitoring`** — single config flag to decouple
6. **`@gmacko/saas-analytics`** — same pattern, completes the observability trio
7. **`@gmacko/email`** — SaaS email templates are universal
8. **`@gmacko/payments`** — Worker-safe Stripe wrapper
9. **`@gmacko/api-client`** — as a generic client/query generator over an Effect `HttpApi`
10. **`@gmacko/storage`**, **`@gmacko/realtime`** — provider wrappers, lower reuse

## Versioning Strategy

- Use **changesets** (already configured in the monorepo)
- Each extracted package gets independent semver
- Breaking changes require a major bump
- The monorepo template pins to `^major.minor` for stability
- CI/CD publishes on merge to main via the existing `release.yml` workflow

## Migration Checklist (per package)

- [ ] Decouple from `@gmacko/config` (replace with constructor config)
- [ ] Keep the package Worker-safe if `apps/web` will depend on it (no `process.env`, no `node:` imports)
- [ ] Add comprehensive JSDoc and README
- [ ] Add unit tests (vitest, use existing `@gmacko/vitest-config`)
- [ ] Set `"private": false` in package.json
- [ ] Add `"publishConfig": { "access": "public" }`
- [ ] Add `"files": ["dist", "src"]` for published package
- [ ] Test with `pnpm pack` locally before publishing
- [ ] Update monorepo template to use published version
- [ ] Add thin re-export wrapper in monorepo for backward compatibility
- [ ] Update CLAUDE.md / README with new import paths
