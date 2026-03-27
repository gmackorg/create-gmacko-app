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

## UI Workflow

- Use Storybook for isolated UI work with `pnpm --filter @gmacko/nextjs storybook`.
- Add or update stories in `packages/ui/src/**/*.stories.tsx` when shared components change.
