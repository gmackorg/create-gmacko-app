# Claude Code Instructions

Read [`AGENTS.md`](./AGENTS.md) first for the shared repo conventions used by Codex, Claude Code, and OpenCode.

## gstack

- Use the vendored gstack suite in `.claude/skills/gstack` for Claude Code slash commands.
- Use `.claude/skills/create-gmacko-app-workflow` for template-specific repo conventions before making structural assumptions.
- Use `/browse` for web browsing and browser QA. Do not use `mcp__claude-in-chrome__*`.
- Available gstack commands in this repo include `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/review`, `/ship`, `/browse`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/retro`, `/debug`, and `/document-release`.
- If the gstack commands are missing or stale, run `cd .claude/skills/gstack && ./setup`.

## Claude-Specific Workflow

1. Use `superpowers:brainstorming` to turn the raw product idea into a first-pass proposal in `docs/ai/INITIAL_PROPOSAL.md`.
2. Run `/plan-ceo-review` to sharpen the problem statement, audience, and scope before implementation starts.
3. Run `/plan-eng-review` to turn the approved proposal into the implementation plan in `docs/ai/IMPLEMENTATION_PLAN.md`.
4. Run `/design-consultation` to establish the design philosophy for the app and write `DESIGN.md`.

If the repo was scaffolded with the optional SaaS bootstrap pack, run that flow after `pnpm bootstrap:local`:

1. `/office-hours`
2. `/autoplan` if available from your user-level gstack install
3. `/design-consultation`
4. the generated [`docs/ai/BOOTSTRAP_PLAYBOOK.md`](./docs/ai/BOOTSTRAP_PLAYBOOK.md), which splits guidance into `Claude-only`, `Codex`, and `OpenCode` sections and adds feature-aware follow-ups for the selected SaaS layers
5. the local follow-up skills in `.claude/skills/bootstrap-saas`, `.claude/skills/launch-landing-page`, `.claude/skills/setup-stripe-billing`, `.claude/skills/bootstrap-expo-app`, and `.claude/skills/test-mobile-with-maestro`

## Local Development (emulate + portless)

The local dev stack uses [`@gmacko/emulate`](https://www.npmjs.com/package/@gmacko/emulate) for service emulation and `portless` for HTTPS `.localhost` URLs. Run `npx @gmacko/emulate init` to generate an `emulate.config.yaml`, then `pnpm dev` to start both. Use `--slug <name>` to namespace services (e.g. `gmacko.emulate.localhost`) so multiple projects can run concurrently.

**Service URLs** (available when running with `--portless`):
- App: `https://gmacko.localhost`
- GitHub OAuth: `https://github.emulate.localhost`
- Google OAuth: `https://google.emulate.localhost`
- Apple OAuth: `https://apple.emulate.localhost`
- Stripe: `https://stripe.emulate.localhost`
- Resend (email): `https://resend.emulate.localhost`
- Postgres: `localhost:5432` (PGlite over wire protocol)
- Redis: `localhost:6379` (redis-memory-server)

**SDK wiring for emulate** (set in `.env`):
- `AUTH_GITHUB_URL`, `AUTH_GITHUB_API_URL`, `AUTH_GOOGLE_URL`, `AUTH_GOOGLE_TOKEN_URL`, `AUTH_APPLE_URL` — override OAuth provider base URLs (defaults to real provider URLs when unset)
- `RESEND_BASE_URL` — native Resend SDK override, no code changes needed
- Stripe: pass `host`/`protocol`/`port` via `StripeConfig` when calling `initStripe`
- `PORTLESS_URL` — used as app `baseURL` for auth
- `BYPASS_MAGIC_LINK=true` — logs magic link URLs to console instead of sending email

**Seed data** is in `emulate.config.yaml` (OAuth client IDs, test users, Stripe products).

## UI Workflow

- Use Storybook for isolated UI work with `pnpm --filter @gmacko/nextjs storybook`.
- Add or update stories in `packages/ui/src/**/*.stories.tsx` when shared components change.
