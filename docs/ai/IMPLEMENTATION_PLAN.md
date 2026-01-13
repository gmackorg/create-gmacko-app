# Gmacko Ventures Turbo Template (create-t3-turbo fork) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Fork `t3-oss/create-t3-turbo`, keep `better-auth`, swap DB to Neon, and add Gmacko's "integrations + AI skill system + setup/provision workflow" using a single-branch, feature-flagged architecture.

**Architecture:** Maintain one canonical `main` branch. Keep integration packages present in-repo, but conditionally wired via configuration (manifest/prompts) and optional install-time pruning. Provide sane defaults (Sentry + PostHog on; Stripe/Email/Realtime/Storage off) with deterministic generation.

**Tech Stack:** Next.js 15, Expo SDK (upstream), tRPC v11, Drizzle ORM, Neon Postgres, better-auth, shadcn-ui, Turborepo + pnpm.

---

## 1) Executive Summary

Fork `create-t3-turbo` and keep upstream-compatible structure, but introduce a single "integration selection" mechanism (manifest or prompts) that wires optional packages predictably. Use Neon as the default Postgres provider and keep better-auth as the core auth system. Port Gmacko's AI skill system and setup/provision scripts as first-class developer experience features, but keep the default "happy path" simple for end users.

---

## 2) Decision Matrix

### Fork vs Fresh

| Option | Recommendation | Why | Costs / Mitigations |
|---|---|---|---|
| **Fork upstream** | **YES (Primary)** | Retains best-of-class scaffolding + updates (Next/Expo/tRPC/drizzle) | Requires disciplined upstream sync + avoiding large rewrites |
| Start fresh + cherry-pick | No | You become the integrator for everything forever | Harder to keep pace with upstream changes |
| "Hybrid fork" (fork + periodic cherry-picks) | Acceptable fallback | If upstream rebase gets painful | Still more manual than disciplined fork |

**Primary choice:** fork + keep `upstream` remote + scheduled sync.

### "Integrations as branches" vs Monolithic flags

| Option | Recommendation | Why | Costs / Mitigations |
|---|---|---|---|
| **Monolithic + feature flags** | **YES (Primary)** | Single source of truth; no branch drift; users can mix-and-match | Requires robust conditional wiring + cleanup tooling |
| Long-lived feature branches | No | Sync + merge conflict hell; test matrix explosion | Not worth it |
| Bundled branches ("full-stack") | No (unless marketing wants it) | Still causes drift | Prefer presets in generator |

**Primary choice:** one `main` with presets in generator (not branches).

---

## 3) Phase 1 — Fork & Core (Auth + DB + API + UI)

### Phase 1 outcomes
- Forked repo under Gmacko org.
- Workspace scope renamed (`@gmacko/*` → `@gmacko/*` or neutral `@repo/*`).
- Neon is the default Postgres provider for Drizzle.
- better-auth remains the auth system (Next.js + Expo).
- CI passes on `main`.

### Task 1.1 — Fork + upstream tracking
**Steps**
1. Fork `t3-oss/create-t3-turbo` into `gmacko/create-gmacko-app` (or local clone).
2. Add upstream remote:
   - `git remote add upstream https://github.com/t3-oss/create-t3-turbo.git`
3. Establish sync cadence (see Maintenance Strategy).

**Verification**
- `git remote -v` shows `origin` + `upstream`.

**Commit**
- "chore: initialize fork with upstream remote instructions" (or keep as docs-only)

---

### Task 1.2 — Rename package scope + repo branding (minimal, mechanical)
**Files (likely)**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: any `packages/*/package.json`, `apps/*/package.json`
- Modify: `README.md`, `.env.example` (and any "acme" references)

**Steps**
1. Choose scope strategy:
   - **Recommended:** keep internal packages under `@gmacko/*` (clear identity), but generator can rewrite for consumers.
2. Replace `@gmacko/` imports and package names with your chosen scope.

**Verification**
- `pnpm -w lint` (if configured) or `pnpm -w typecheck`
- `pnpm -w build`

**Commit**
- "chore: rename workspace scope and branding"

---

### Task 1.3 — Swap Vercel Postgres/Supabase URL patterns → Neon (core DB change)
Upstream uses `@vercel/postgres` + `drizzle-orm/vercel-postgres` and an env var named `POSTGRES_URL`. You want Neon.

**Recommended DB target**
- Use **Neon HTTP + Drizzle** (already common in serverless contexts):
  - `@neondatabase/serverless`
  - `drizzle-orm/neon-http`

**Concrete upstream paths (from research)**
- `packages/db/src/client.ts` (currently uses `@vercel/postgres`)
- `packages/db/drizzle.config.ts` (currently expects `POSTGRES_URL` and strips pooler ports)
- `.env.example` (currently has Supabase pooler-ish example)
- `apps/*/src/env.ts` (validates env vars)
- `turbo.json` (`globalEnv`)

**Implementation steps**
1. Update `packages/db/package.json`:
   - remove `@vercel/postgres`
   - add `@neondatabase/serverless`
2. Update `packages/db/src/client.ts`:
   - switch to `neon(process.env.DATABASE_URL)` (or rename to `DATABASE_URL`; pick one and standardize)
3. Update `packages/db/drizzle.config.ts`:
   - stop "pooler port rewrite"; Neon URLs shouldn't need the `:6543 → :5432` hack
4. Update env var naming:
   - **Recommended:** standardize on `DATABASE_URL` for industry consistency.
   - If you keep `POSTGRES_URL` for upstream parity, add a compatibility alias in env validation.
5. Update `.env.example` with a Neon-format URL:
   - `postgresql://...neon.tech/...?...sslmode=require`
6. Ensure all apps/packages read the chosen env var (Zod validation files).

**Verification**
- `pnpm -w typecheck`
- `pnpm --filter db push` (or your equivalent) against a test Neon DB
- Run Next.js + Expo dev flows if available

**Commit**
- "feat(db): use Neon as default Postgres provider"

**Important watch-out (runtime/driver)**
- better-auth + Drizzle should remain unchanged, but confirm your versions: some Neon driver major versions have API constraints. Lock versions in `pnpm-lock.yaml` and don't "float" major upgrades until tested.

---

### Task 1.4 — Confirm better-auth continues working (Next.js + Expo)
**Key upstream auth paths**
- `packages/auth/src/index.ts` (better-auth init with drizzle adapter)
- `apps/nextjs/src/app/api/auth/[...all]/route.ts` (auth handler)
- `apps/nextjs/src/auth/server.ts` (initAuth + cookies plugin)
- `apps/expo/src/utils/auth.ts` (SecureStore + expo client plugin)
- `packages/api/src/trpc.ts` (injects auth + db into tRPC context)

**Steps**
1. Ensure `packages/auth` still imports DB from `packages/db` after the Neon swap.
2. Confirm Expo config uses scheme + trusted origins correctly (no silent 403s).

**Verification**
- Basic auth smoke test:
  - Start web app; hit `/api/auth/*` endpoints; confirm session cookie can be created/read.
- Expo auth:
  - Confirm SecureStore writes and session restores.

**Commit**
- "chore(auth): validate better-auth against Neon db client"

---

## 4) Phase 2 — Integrations (Monolithic + Flags)

### Guiding principle
Integrations are **optional packages + optional provider wiring**. "Disabled" means:
- No provider initialization
- No env var required
- No runtime code paths executed
- Optional: packages removed at scaffold time (for minimal installs)

### Integration selection design (single clear path)
**Primary mechanism:** one config file generated at scaffold time:
- `gmacko.config.ts` (or `src/config/integrations.ts`), exported as a typed object like:
  ```ts
  export const integrations = {
    sentry: true,
    posthog: true,
    stripe: false,
    email: false,
    realtime: false,
    storage: false,
  } as const;
  ```
**Input sources (choose one, support both if cheap)**
- Simple prompts in `create-gmacko-app`
- Optional `PROJECT_MANIFEST.json` for Gmacko internal workflows

**Recommended defaults**
- Always: `auth`, `db`, `api`, `ui`
- Default ON: `sentry`, `posthog`
- Default OFF: `stripe`, `email`, `realtime`, `storage`

---

### Task 2.1 — Add integration packages (or port them) behind stable interfaces
If your current template already has these packages, port them with minimal changes:
- `packages/monitoring` (Sentry wrapper)
- `packages/analytics` (PostHog wrapper)
- `packages/payments` (Stripe wrapper)
- `packages/i18n` (optional; if you want it as core later)
- `packages/store` (optional)

**Steps**
1. Copy packages into the fork with minimal refactors.
2. Ensure export pattern stays consistent:
   - `@gmacko/analytics`, `@gmacko/analytics/web`, `@gmacko/analytics/native` (as needed)
3. Ensure packages can be "present but unused" without side effects.

**Verification**
- `pnpm -w typecheck` with integrations disabled
- `pnpm -w typecheck` with integrations enabled (via config toggles)

**Commit**
- One integration per commit (easier rollback and upstream rebases).

---

### Task 2.2 — Conditional provider wiring in apps (web + expo)
**Web (Next.js)**
- Add providers only when enabled:
  - Sentry init
  - PostHog provider
  - Stripe context (if used)
- Keep auth first (better-auth cookie/session), then analytics/monitoring, then API.

**Expo**
- Mirror the same conditional wiring pattern:
  - Analytics native init
  - Sentry native init
  - Payments only if used on-device (often it's mostly webhooks + server)

**Verification**
- Lint/typecheck in both toggles
- Build web + expo

---

### Task 2.3 — Env var strategy (no required env vars for disabled integrations)
**Rules**
- If integration is OFF, env schema must not require its vars.
- If ON, env schema requires them and fails fast with clear messaging.

**Implementation**
- Use Zod env schemas that branch based on `integrations` config.
- Keep `.env.example` split into sections with comments.

**Verification**
- Run with only core env vars; everything should boot.
- Turn on Sentry/PostHog; missing vars should fail with a clear error.

---

### Task 2.4 — Optional "prune unused integrations" at scaffold time
This is optional but valuable DX.

**Recommendation**
- Keep repo monolithic, but generator can optionally remove unused packages:
  - Delete packages
  - Remove imports
  - Remove provider wiring stubs
  - Remove env example sections

**Mitigation**
- Make pruning opt-in (`--prune`) so internal Gmacko workflows can keep everything.

---

## 5) Phase 3 — DX & Tooling (Setup scripts + AI skills + docs)

### Task 3.1 — Decide: `PROJECT_MANIFEST.json` stays (recommended) + add simple prompts
**Recommendation**
- Keep `PROJECT_MANIFEST.json` + `INITIAL_PLAN.md` for Gmacko's AI workflows.
- Add `create-gmacko-app` prompts for public users (generates a manifest internally or generates config directly).

This gives:
- Internal: deterministic artifact-driven workflow
- External: simple prompts, no "AI system required"

---

### Task 3.2 — Port AI skill system to the fork
**Port these directories**
- `docs/ai/` (design, catalog, checklists, examples)
- `.opencode/skill/` (skills)
- `opencode.json` (wiring)
- `scripts/setup.sh`, `scripts/provision.sh` (adapted to new repo)

**Integration points**
- Update skills to reference new repo structure (`apps/nextjs`, `apps/expo`, etc.)
- Update provisioning targets: Neon + (optional) Sentry/PostHog/Stripe/Email providers you standardize on

**Verification**
- Run an init workflow end-to-end:
  - manifest creation
  - plan generation
  - setup script run
  - provision script run (in dry-run mode if supported)

---

### Task 3.3 — Add/Update setup & provisioning scripts (align with Option A flags)
**setup/generator responsibilities**
- Choose integrations
- Write `integrations` config
- Ensure env example aligns
- Optionally prune

**provision script responsibilities**
- Provision only what's enabled (or allow `--only neon`, etc.)
- Update `.env.local` safely
- Never commit secrets

---

### Task 3.4 — Documentation
Add one canonical doc that explains:
- Core architecture
- How to select integrations
- "Disabled means no env vars required"
- How to run web/mobile
- How DB/auth work

Recommended docs:
- `README.md` (user-facing quick start)
- `docs/ai/README.md` (internal AI workflow)
- `docs/integrations/*.md` (optional)

---

## 6) Migration Guide (from current Gmacko template → new fork)

### Who this is for
Existing users of `vercel-neon-expo-template` who want to move to the new create-t3-turbo-based template.

### Migration strategy (recommended)
Treat as a "new app skeleton migration", not an in-place refactor:
1. Scaffold a fresh app from the new template.
2. Port business logic and UI feature-by-feature.
3. Port DB schema with Drizzle migrations (or re-run `push` carefully).
4. Port env vars and external services.

### Key differences to document
- **Auth:** Clerk → better-auth
  - Migration path: users must re-auth; account table mapping changes.
- **DB env var:** `DATABASE_URL` vs `POSTGRES_URL` (standardize and provide aliasing guidance).
- **Provider hierarchy:** your old template had explicit provider hierarchy; new template will use conditional wiring but keep the same conceptual order.
- **Integrations packaging:** now behind toggles; disabled integrations removed from runtime.

### Suggested migration checklist
- [ ] Stand up new app with matching integrations toggles
- [ ] Copy shared packages / domain code
- [ ] Recreate DB schema + seed
- [ ] Validate auth flows + sessions
- [ ] Validate analytics/monitoring events
- [ ] Cutover DNS / deploy

---

## 7) Maintenance Strategy (Staying current with upstream)

### Principles
- Keep your changes in **small, thematic commits** (DB swap, tooling, integrations, docs).
- Avoid rewriting upstream layout unless essential.
- Automate detection of drift via CI.

### Workflow
1. Weekly/bi-weekly: `git fetch upstream`
2. Rebase your `main` onto upstream main (or merge if your team prefers).
3. Resolve conflicts immediately; if conflicts grow, you're diverging too much.
4. Run full CI:
   - `pnpm -w typecheck`
   - `pnpm -w lint`
   - `pnpm -w build`
5. Tag releases in your fork (template versioning).

### Tooling recommendations (minimal)
- Add a GitHub Action that runs the above checks.
- Add Dependabot/Renovate only if you already use it elsewhere (avoid extra moving parts unless needed).

---

## 8) Risk Analysis

### Risk: Env/config complexity makes template brittle
**Mitigation**
- Make integration flags the single source of truth.
- Keep defaults working with minimal env vars.
- Enforce "OFF means no env validation required".

### Risk: DB driver/runtime mismatch (serverless/edge)
**Mitigation**
- Prefer Node runtime paths for DB access when needed.
- Lock Neon + Drizzle versions known-good.
- Add a small "DB connectivity smoke test" script/command.

### Risk: Upstream updates break your wiring
**Mitigation**
- Keep integration wiring shallow and localized (single provider file per app).
- Keep DB changes limited to `packages/db`.

### Risk: Auth migration (Clerk → better-auth) for existing users
**Mitigation**
- Clearly state: "auth migration is a breaking change".
- Provide recommended migration path (new app + port features).

---

## 9) Timeline Estimate (rough)

**Phase 1 (Fork & Core): Medium (1–2 days)**
- Fork + rename + Neon swap + verify auth flows

**Phase 2 (Integrations via flags): Medium–Large (2–5 days)**
- Port packages + conditional wiring + env strategy + optional pruning

**Phase 3 (DX & Tooling): Medium (1–2 days)**
- Port AI skill system + scripts + docs polish

**Total:** Medium–Large (4–9 days) depending on how much of your existing integration code ports cleanly.

---

## Appendix A — Known upstream files (reference map)

- DB:
  - `packages/db/src/client.ts`
  - `packages/db/drizzle.config.ts`
  - `.env.example`
  - `turbo.json` (`globalEnv`)
  - `apps/*/src/env.ts`
- Auth:
  - `packages/auth/src/index.ts`
  - `apps/nextjs/src/app/api/auth/[...all]/route.ts`
  - `apps/nextjs/src/auth/server.ts`
  - `apps/expo/src/utils/auth.ts`
  - `packages/api/src/trpc.ts`

---

## Appendix B — Upstream Reference Links

| Artifact | Location |
|----------|----------|
| Root README | [README.md](https://github.com/t3-oss/create-t3-turbo/blob/main/README.md) |
| pnpm Workspace | [pnpm-workspace.yaml](https://github.com/t3-oss/create-t3-turbo/blob/main/pnpm-workspace.yaml) |
| Auth Config | [packages/auth/src/index.ts](https://github.com/t3-oss/create-t3-turbo/blob/main/packages/auth/src/index.ts) |
| Auth Schema | [packages/db/src/auth-schema.ts](https://github.com/t3-oss/create-t3-turbo/blob/main/packages/db/src/auth-schema.ts) |
| Database Client | [packages/db/src/client.ts](https://github.com/t3-oss/create-t3-turbo/blob/main/packages/db/src/client.ts) |
| tRPC Router | [packages/api/src/root.ts](https://github.com/t3-oss/create-t3-turbo/blob/main/packages/api/src/root.ts) |
| tRPC Context | [packages/api/src/trpc.ts](https://github.com/t3-oss/create-t3-turbo/blob/main/packages/api/src/trpc.ts) |
| Next.js Layout | [apps/nextjs/src/app/layout.tsx](https://github.com/t3-oss/create-t3-turbo/blob/main/apps/nextjs/src/app/layout.tsx) |
| Next.js Auth | [apps/nextjs/src/auth/server.ts](https://github.com/t3-oss/create-t3-turbo/blob/main/apps/nextjs/src/auth/server.ts) |
| Expo Auth | [apps/expo/src/utils/auth.ts](https://github.com/t3-oss/create-t3-turbo/blob/main/apps/expo/src/utils/auth.ts) |
| Drizzle Config | [packages/db/drizzle.config.ts](https://github.com/t3-oss/create-t3-turbo/blob/main/packages/db/drizzle.config.ts) |
