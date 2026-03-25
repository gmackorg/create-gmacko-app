# Template Showcase Roadmap

> **Status:** Active roadmap for the remaining work after the ForgeGraph/Nix/Postgres/jj migration.

## Goal

Make `create-gmacko-app` feel like the best default starting point for modern AI-assisted SaaS teams that want:

- a strong owned-infrastructure path
- a credible Cloudflare Workers lane
- a serious Expo/mobile story
- agent-native repo ergonomics for Codex, Claude Code, and OpenCode
- a template that feels opinionated, current, and production-ready instead of generic

## Strategic Position

The template should not try to be everything to everyone.

It should win by being:

- the best **ForgeGraph + Nix + colocated Postgres** starter
- a credible **Next.js 16** and **Expo SDK 55** starter
- a pragmatic **Cloudflare-ready** starter via `vinext` and TanStack Start without making Workers the default operating model
- a strong **AI-native repo** for multi-agent development

## Why This Direction

This roadmap assumes the following current platform realities:

- Next.js 16 is leaning harder into explicit runtime and debugging primitives such as Cache Components, `proxy.ts`, and DevTools MCP.
- Expo recommends development builds for production-grade work, while Expo Orbit improves simulator and device workflow speed.
- Cloudflare's official Next.js path is still adapter-shaped and distinguishes Node-based `dev` from more production-accurate preview in `workerd`.
- `vinext` is promising for Next-like DX on Workers, but it is still explicitly experimental.
- TanStack Start remains the cleaner Cloudflare-native alternative when we want Workers-first behavior from day one.

## Current Strengths

The template already has:

- ForgeGraph-first deployment guidance
- Nix and colocated Postgres defaults
- `jj`-first repo initialization
- `oxlint` + `biome` + `lefthook` + `commitlint` + `knip`
- `vinext` as an experimental Workers lane
- Expo development-build defaults and Orbit-aware docs
- agent-native repo instructions and MCP support
- stronger generated-app smoke coverage across ForgeGraph, Cloudflare, Expo, and TanStack Start
- adaptive scaffold README profile summaries
- a generated `bootstrap:local` flow for the default local path

## Remaining Work

### 1. First-Run Product Quality

**Outcome:** A newly scaffolded repo feels polished in the first 15 minutes.

Remaining work:

- keep improving the generated `.env.example` so variables are grouped more clearly by app, package, and deployment lane
- add clearer sample values and setup notes for optional integrations
- make the generated first-run output even more profile-aware for web-only, full-stack, mobile-only, and Workers-first starts
- add a more guided first-run handoff after `pnpm bootstrap:local`, including what to do when Docker or ForgeGraph config is missing
- make the generated README adapt more aggressively to selected integrations instead of mostly adapting by platform

### 2. Deployment Realism

**Outcome:** The ForgeGraph lane feels like a first-class deployment system, not just a handoff.

Remaining work:

- tighten `.forgegraph.yaml` against the real evolving ForgeGraph schema instead of our conservative metadata shape
- add generated stage-specific secret/env guidance based on enabled integrations
- add a generated deployment checklist for first production launch and rollback
- add optional preview-stage metadata generation for teams that want ForgeGraph previews immediately
- add richer `forge` repo scripts once the CLI surface in `../ForgeGraph` stabilizes
- add a repo-local deployment status/check script that combines `forge status`, health route checks, and recent deployment context

### 3. Cloudflare Lane Maturity

**Outcome:** The Workers lane is explicit, credible, and clearly labeled by maturity.

Remaining work:

- generate a stronger `wrangler.jsonc` template with more realistic bindings placeholders, comments, and environment sections
- add a `preview:vinext` script or equivalent production-like local verification path
- add a generated Cloudflare lane README inside scaffolded apps instead of relying only on repo-level docs
- add integration compatibility docs for `vinext` versus standard Next.js versus TanStack Start
- decide which integrations are officially supported in `vinext` and which remain experimental
- add a Cloudflare-specific CI job that validates `wrangler` config syntax directly

### 4. Mobile Excellence

**Outcome:** The Expo app feels like a real SaaS mobile starter, not an afterthought.

Remaining work:

- scaffold app identifiers, deep link domains, and universal link/app link docs more comprehensively
- add optional RevenueCat, notifications, and app-store-ready configuration flows that align with current Expo expectations
- generate stronger mobile env separation for dev, staging, and production
- add a generated mobile QA checklist covering dev-client, deep links, auth callback flows, notifications, and release builds
- add Maestro-ready smoke assets and optional example flows for sign-in, onboarding, and settings
- add clearer store submission preparation docs and app review checklists

### 5. Agent-Native DX

**Outcome:** This feels like the best starter for teams building with Codex, Claude Code, and OpenCode.

Remaining work:

- generate optional project-local agent config variants by selected stack
- add more reusable Claude/OpenCode subagents for repo review, ForgeGraph deploy review, and release prep
- add a generated issue/PR workflow tuned for agent collaboration and repo plans
- add a shared prompt library for debugging, refactors, release audits, and framework upgrades
- add a small “agent quickstart” section to scaffolded READMEs
- document how to use the Next DevTools MCP effectively during app development

### 6. Framework Depth

**Outcome:** The template should feel current with framework-level best practices, not just dependency updates.

Remaining work:

- adopt Next.js 16 features more deliberately in scaffolded app code where they materially improve DX or performance
- revisit whether React Compiler should become an opt-in generated default
- add a clearer recommendation matrix for when to delete either Next.js or TanStack Start from a dual-web scaffold
- evaluate whether Storybook 10 should stay default everywhere or become selective by scaffold profile
- add opinionated data-fetching and mutation examples that reflect the current stack well

### 7. Integration Quality

**Outcome:** Optional integrations should feel curated, not bolted on.

Remaining work:

- audit each optional integration for install success, runtime compatibility, and docs quality across all supported lanes
- define which integrations are stable on ForgeGraph, stable on web-only, stable on Expo, and experimental on Workers
- add integration-specific smoke checks where they can be run without external credentials
- improve generated env comments and setup docs for Stripe, Resend, PostHog, Sentry, RevenueCat, notifications, and storage
- add compatibility tests for pruned and custom-scope combinations beyond the current surface

### 8. Showcase Quality

**Outcome:** The repo should look like a flagship reference project.

Remaining work:

- create a polished demo application mode or example business domain instead of only generic scaffolding
- add screenshots or short videos showing web, mobile, ForgeGraph, and agent flows
- add a comparison section explaining how this template differs from T3, create-next-app, create-t3-turbo, and other starters
- add benchmark-style claims only where we can support them with repeatable checks
- create a stronger landing README with clearer personas and decision paths

### 9. Adoption and Distribution

**Outcome:** The template is easy to discover, evaluate, and trust.

Remaining work:

- publish a public roadmap and changelog flow that users can actually follow
- make release notes more user-facing and scaffold-oriented
- add versioned migration guides for breaking template changes
- improve npm metadata, keywords, and discoverability
- create a small docs site or docs area for generated-app operations, not just repo development

### 10. Trust and Maintenance

**Outcome:** Teams can treat this as a serious foundation.

Remaining work:

- add stronger security scanning and dependency review guidance
- define a clear support policy for framework and SDK version drift
- add a documented compatibility matrix for Node, pnpm, Expo SDK, Next.js, and platform lanes
- add scheduled upgrade tasks and checklists for Next.js, Expo, TanStack Start, and Cloudflare ecosystem changes
- add a clearer deprecation policy for experimental lanes such as `vinext`

## Prioritized Phases

### Phase 1: Make The Default Path Exceptional

Focus:

- first-run UX
- ForgeGraph deployment realism
- auth/db/bootstrap confidence
- generated README quality

Success bar:

- a new user can scaffold, understand the repo, boot Postgres, generate auth/DB artifacts, and get to a healthy app quickly

### Phase 2: Make The Mobile And Workers Lanes Credible

Focus:

- Expo release-quality workflows
- Cloudflare lane maturity
- explicit lane support matrix

Success bar:

- users can tell exactly which lane is stable, which is experimental, and what tradeoffs they are making

### Phase 3: Make It A Showcase

Focus:

- polished demo/domain
- stronger docs and visuals
- adoption/distribution polish
- public comparison positioning

Success bar:

- the repo looks intentional enough to be shared as a flagship starter, not just an internal scaffold

## Success Metrics

Use measurable signals:

- scaffold success rate in CI for default, minimal, full, custom-scope, and Workers variants
- time-to-first-success for a new maintainer on the default path
- number of generated-app smoke checks that run without external credentials
- reduction in manual steps between scaffold and first healthy app
- release cadence that stays current with Next.js, Expo, and TanStack Start without long drift
- quality of docs, measured by whether users can follow the happy path without tribal knowledge

## Concrete Next Batch

The highest-value next batch after this roadmap:

1. tighten `.forgegraph.yaml` against the live ForgeGraph schema
2. improve `vinext` documentation and config validation beyond deploy-script smoke checks
3. add stronger mobile release and deep-link scaffolding
4. create a showcase demo mode and sharper landing README positioning
5. turn the new first-run flow into a more guided local success path with better failure recovery hints

For the execution-grade task list, exact file targets, and verification gates, see [`/Volumes/dev/create-gmacko-app/docs/plans/2026-03-25-template-showcase-execution-plan.md`](/Volumes/dev/create-gmacko-app/docs/plans/2026-03-25-template-showcase-execution-plan.md).

## Source Notes

This roadmap reflects the current official direction from:

- Next.js 16 release notes
- Expo development build docs and Expo Orbit
- Cloudflare Workers framework guidance for Next.js
- TanStack Start documentation
- `vinext` project status
