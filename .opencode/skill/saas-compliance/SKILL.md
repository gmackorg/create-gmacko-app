---
name: saas-compliance
description: SOC2 compliance patterns, audit logging, security best practices, and SaaS boilerplate
---

# SaaS Compliance Skill

Build features that meet enterprise-grade security and compliance standards. This skill enforces patterns for SOC2 readiness, audit logging, data privacy, and security hardening on the Workers + D1 stack.

## SOC2 Trust Service Criteria

SOC2 compliance is organized around five trust service criteria. This skill maps each to concrete implementation patterns in the codebase.

### 1. Security (Common Criteria)

#### Authentication & Authorization

```
✓ Better Auth with session management           → packages/auth/
✓ Role-based access control (user, admin)        → packages/db/src/auth-schema.ts (`role`), packages/domain/src/roles.ts
✓ Workspace roles (owner > admin > member)       → `WorkspaceRole(min)` middleware
✓ API key authentication with scopes             → packages/auth/src/api-keys.ts, `SessionOrKey(scope)`
✓ Session expiration and rotation                → Better Auth config (packages/auth/src/index.ts)
✓ CSRF protection                                → Origin / Sec-Fetch-Site check on non-GET cookie requests
✓ Magic link sign-in                             → Better Auth magicLink plugin
✓ Social providers (GitHub, Google, Apple)       → genericOAuth + built-in Apple
✓ Expo client                                    → @better-auth/expo
✓ Credential declared per endpoint               → docs/API_AUTH.md (generated from the contract)
```

**Checklist for every new feature:**

- [ ] Every endpoint declares exactly one credential: public, `Session`, or `SessionOrKey(scope)` (`endpoint-declares-credential`)
- [ ] Mutations take `SessionOrKey("write")`, deletes `SessionOrKey("delete")`, admin operations `SessionOrKey("admin")` + `AdminOnly`
- [ ] Sensitive operations (delete account, complete bootstrap) accept `Session` only; a leaked key must never reach them
- [ ] Role checks read D1, never the cookie cache (the middleware does this)
- [ ] Input is validated by the domain `Schema` before any handler runs
- [ ] SQL injection is prevented (Drizzle query builder; `sql` template only with bound parameters)
- [ ] XSS is prevented (React's default escaping + no `dangerouslySetInnerHTML`; CSP nonce on inline scripts)

#### Secrets Management

```
✓ Stage secrets held by ForgeGraph               → forge secret set KEY --stage <stage>
✓ Pushed to the Worker as bindings               → pnpm secrets:push --stage <stage> (wrangler secret put)
✓ One reader of bindings                         → apps/web/src/server/config.ts (AppConfig.fromBindings)
✓ No process.env in the Worker bundle            → pnpm check:standards (no-raw-process-env)
✓ No committed credentials                       → pnpm check:standards (no-committed-credentials)
✓ Never .dev.vars                                → pnpm check:standards (no-dev-vars)
```

**Rules:**
- NEVER commit `.env` files, API keys, or credentials
- ALWAYS read configuration through `AppConfig` (server) or `~/env` (browser `VITE_*`)
- ALWAYS use different secrets for development, staging, and production
- ALWAYS document required secrets in `.env.example` with placeholder values

#### Network Security

```
✓ HTTPS enforced (HSTS outside development)     → apps/web/src/server/headers.ts
✓ Content Security Policy with per-request nonce → apps/web/src/server/headers.ts
✓ X-Frame-Options: DENY                          → apps/web/src/server/headers.ts
✓ X-Content-Type-Options: nosniff                → apps/web/src/server/headers.ts
✓ Strict Referrer-Policy                         → apps/web/src/server/headers.ts
✓ Permissions-Policy (no camera/mic/geo)         → apps/web/src/server/headers.ts
✓ Trusted origins per stage                      → ALLOWED_ORIGINS (wrangler var), Better Auth trustedOrigins
✓ Rate limiting per endpoint                     → `RateLimit(scope)` annotation, packages/api/src/rate-limit.ts
✓ x-request-id / x-trace-id on every response    → EndpointBoundary
```

### 2. Availability

```
✓ Health check endpoints                         → /api/health, /api/health/live, /api/health/ready, /.well-known/forge-health
✓ Generic responses outside development          → packages/api/src/health
✓ Error boundaries (React)                       → route errorComponent
✓ Sentry error tracking                          → @sentry/cloudflare (Worker), @sentry/react (browser)
✓ Graceful degradation for disabled integrations → @gmacko/config toggle pattern
✓ Background work after the response             → Background.run (waitUntil)
✓ Cron                                           → scheduled handler (wrangler.jsonc triggers.crons)
✓ Migrate-then-deploy                            → scripts/deploy-stage.mjs
✓ Point-in-time recovery                         → D1 Time Travel (docs/RUNBOOK.md)
```

### 3. Processing Integrity

```
✓ Input validation (Effect Schema)               → packages/domain (contract)
✓ Type safety end to end                         → HttpApi contract → client → apps
✓ Database constraints (FK, NOT NULL, unique)    → Drizzle SQLite schema
✓ Atomic multi-statement writes                  → Database.batch (D1 batch)
✓ Read-check-write without races                 → guarded Database.updateWhere (0 rows = Conflict)
✓ Stripe webhook signature verification          → POST /api/webhooks/stripe
✓ Idempotent operations where possible           → upserts (waitlist), idempotent membership inserts
```

### 4. Confidentiality

```
✓ Role-based data access (user/admin/workspace roles)
✓ API key scoping (read/write/delete/admin)
✓ Session isolation (users see only their data)
✓ Workspace-scoped data access
✓ Structured logs without secrets                → @gmacko/logging
✓ API key hashing (WebCrypto SHA-256)            → packages/auth/src/api-keys.ts
```

### 5. Privacy

```
✓ User data deletion (cascade on user delete)    → Drizzle schema, settings.deleteAccount
✓ Account deletion with confirmation             → DELETE /api/account (Session only)
✓ Preference management (user settings)          → settings.getPreferences / updatePreferences
✓ Privacy policy page                            → /privacy
✓ Terms of service page                          → /terms
```

## Audit Logging

Audit logging is a later-phase SaaS layer (see `docs/ai/DEVELOPER_EXPERIENCE.md`). Until it lands, every endpoint already produces one span named `group.endpoint` with the request id, the credential kind, and the outcome, exported over OTLP and retained by the collector; treat that as the audit trail for API calls.

When adding an audit table, follow the same rules as any other write: an `audit_log` table with `ON DELETE SET NULL` from `user`, inserted inside the same `Database.batch` as the mutation it records.

### What to Audit

| Action | Priority |
|--------|----------|
| User login / failed login | Required |
| User signup | Required |
| Account deletion | Required |
| Role change (`admin.updateUserRole`) | Required |
| API key create / revoke | Required |
| Subscription change / cancel | Required |
| Workspace invite create / accept | Required |
| Launch controls change | Required |
| Waitlist review | Recommended |
| Settings update | Recommended |

## Rate Limiting

Rate limits are declared on the contract, not applied in handlers:

```typescript
// packages/domain/src/<group>/api.ts
HttpApiEndpoint.post("submitWaitlistEntry", "/waitlist", { ... })
  .middleware(RateLimit("contact")),
```

| Scope | Where | Use For |
|------|-------|---------|
| `contact` | `settings.submitWaitlistEntry` | Public forms |
| `api-keys` | `settings.createApiKey`, `revokeApiKey` | Key minting and revocation |
| `operator-api` | every `/api/admin/*` endpoint | Operator tools |

Allowances live in `packages/api/src/rate-limit.ts` (`defaultRateLimits`); the counter is keyed by the credential as sent (bearer, else session cookie), else the client address. A hit is 429 `RateLimited` with `Retry-After`.

## Data Retention & Deletion

### User Account Deletion

When a user deletes their account (`DELETE /api/account`, `Session` only), the auth `user` row is deleted and the schema cascades:

```
session            → CASCADE (deleted)
account            → CASCADE (deleted)
api_keys           → CASCADE (deleted)
user_preferences   → CASCADE (deleted)
workspace_member   → CASCADE (deleted)
owned workspaces   → CASCADE (memberships, invites, subscription, usage)
```

Never hand-roll a partial delete (`no-partial-account-deletion`); route deletion through `settings.deleteAccount`.

### Session Cleanup

```bash
# Periodic cleanup of expired sessions (run from the scheduled handler or by hand)
pnpm -F @gmacko/db exec wrangler d1 execute DB --remote --config ../../apps/web/wrangler.jsonc \
  --command "DELETE FROM session WHERE expires_at < (unixepoch() - 30*24*60*60) * 1000"
```

## SOC2 Readiness Checklist

### Technical Controls
- [ ] All endpoints declare a credential except explicitly public ones
- [ ] RBAC enforced (`AdminOnly`, `WorkspaceRole`)
- [ ] Input validation on all user inputs (domain `Schema`)
- [ ] Endpoint spans exported for all sensitive operations
- [ ] Error monitoring active (Sentry)
- [ ] Health checks configured (`/api/health/ready`, `/.well-known/forge-health`)
- [ ] HTTPS enforced (HSTS header)
- [ ] CSP header configured (nonce)
- [ ] Security headers configured (X-Frame-Options, X-Content-Type-Options, etc.)
- [ ] Rate limiting on public and sensitive endpoints
- [ ] Secrets stored in ForgeGraph and pushed as bindings, not code
- [ ] API keys are hashed before storage
- [ ] Sessions expire and rotate
- [ ] `x-request-id` tracing enabled

### Operational Controls
- [ ] Separate environments (development, preview, staging, production), one D1 each
- [ ] Database backups: D1 Time Travel (30 days) plus exports before risky operations
- [ ] Incident response via Sentry alerts (`docs/RUNBOOK.md`)
- [ ] Change management via git + PR reviews; migrate-then-deploy
- [ ] Dependency updates tracked (Renovate)
- [ ] Standards enforced in CI (`pnpm check:standards`)

### Legal & Documentation
- [ ] Privacy policy page exists (/privacy)
- [ ] Terms of service page exists (/terms)
- [ ] API documentation exists (OpenAPI spec, `docs/API_AUTH.md`)
- [ ] Account deletion available to users
- [ ] Incident response procedure documented
- [ ] Data retention policy documented

## Feature Development Compliance Checklist

Every new feature MUST pass this checklist:

```
□ Input validated by the domain Schema
□ Credential declared on every endpoint; mutations never public
□ Authorization checked (ownership, workspace role, or admin)
□ Sensitive operations Session-only
□ Error cases are declared typed errors and reported to Sentry when unexpected
□ No secrets or PII in logs
□ Cascade deletion configured for user-owned data
□ SQL injection impossible (Drizzle query builder only)
□ XSS impossible (React escaping, no dangerouslySetInnerHTML)
□ CSRF protection active (origin check on cookie requests)
□ Rate limiting declared on public/sensitive endpoints
□ Account deletion cascades new tables
□ No db.transaction; Database.batch or guarded updateWhere
```
