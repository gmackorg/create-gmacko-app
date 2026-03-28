# Developer Experience

This repo is designed around a few stable assumptions:

- ForgeGraph + Nix is the default owned-infrastructure path.
- Postgres should start colocated with the app and move hosted later only when operating pressure justifies it.
- `jj` is the default local VCS, with Git compatibility kept for GitHub and external tooling.
- Shared repo instructions belong in `AGENTS.md`, not split across tool-specific files.

## Agent Workflow

Use this layout for agent-native development:

- `AGENTS.md`: canonical repo instructions for Codex, Claude Code, and OpenCode.
- `CLAUDE.md`: Claude-specific entrypoint for gstack and slash-command workflows.
- `.claude/settings.json`: Claude project permissions, including `../ForgeGraph` as an additional working directory for deployment workflows.
- `opencode.json`: loads shared repo docs into OpenCode without duplicating them in `AGENTS.md`.
- `.mcp.json`: project MCP declaration for agent-assisted tooling.

### Codex

- Keep high-signal repo conventions in `AGENTS.md`.
- Use MCP servers when they are configured and relevant before falling back to manual inspection.
- Prefer shared docs over Codex-only guidance so the repo stays portable across tools.
- Add the OpenAI developer docs MCP server in your Codex user config for API, Codex, and platform-doc lookups:
  - `codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp`

### Claude Code

- Keep project-level settings in `.claude/settings.json` when hooks, MCP permissions, or other Claude-specific settings are needed.
- Use project subagents in `.claude/agents/` only for narrow, reusable jobs.
- Keep gstack vendored for Claude slash-command workflows, but do not make the rest of the repo depend on Claude-only file conventions.
- Use `.claude/commands/` only for project-specific reusable workflows that genuinely need a slash command entrypoint.

### OpenCode

- OpenCode prefers `AGENTS.md` and falls back to `CLAUDE.md` only when `AGENTS.md` is absent.
- Keep shared supplemental docs in `opencode.json`.
- Use OpenCode agents for focused planning/review/build roles when that improves context hygiene.
- Use OpenCode `permission` settings to keep destructive or high-risk MCP tools on approval instead of overloading `AGENTS.md` with tool policy.

## MCP

The repo currently ships the official Next.js MCP server in `.mcp.json` for Next.js 16+:

- `next-devtools-mcp` connects to the running Next.js dev server automatically.
- It gives agents access to current errors, logs, routes, runtime state, and upgrade/debugging help.
- Keep this enabled for the Next.js app unless the repo intentionally drops Next.js.

## Web Stack

Current default recommendations:

- Stable owned path: Next.js 16 + ForgeGraph + Nix + colocated Postgres.
- Workers-native alternative: TanStack Start on Cloudflare Workers.
- Experimental Workers path for Next.js DX parity: `vinext`.
- UI isolation: Storybook 10.
- Lint/format/check baseline: `oxlint`, `biome`, `tsc --noEmit`, `knip`.

### Cloudflare Support Matrix

- Next.js on Workers via the OpenNext adapter is viable, but still adapter-shaped.
- `vinext` is the experimental path if we want Next.js semantics on a Vite/Workers runtime.
- TanStack Start is the cleaner default when we want Cloudflare-native runtime behavior from day one.

### Workers Integration Matrix

Use these labels literally when describing the `vinext` lane:

- `stable`: works well enough to recommend without caveats for the Workers lane
- `experimental`: plausible, but not a lane we should oversell yet
- `unsupported`: do not position this as part of the current `vinext` contract

Current direction:

| Integration | TanStack Start on Workers | Next.js via `vinext` |
| --- | --- | --- |
| Sentry | experimental | experimental |
| PostHog | stable | experimental |
| Stripe | unsupported | unsupported |
| Email | stable | experimental |
| Realtime | experimental | experimental |
| Storage | experimental | experimental |

If a lane is not clearly `stable`, call out the risk in docs and generated guidance instead of implying parity with the ForgeGraph path.

Treat ForgeGraph/Nix and Cloudflare Workers as separate deployment lanes. Do not force one runtime model to satisfy both.

## SaaS Scaffold Maturity

Current SaaS direction:

- `stable`: guided first-run bootstrap, workspace-centric onboarding, collaboration, billing/limits/metering primitives, support/public shell, launch controls, referrals, operator wrapper lane
- `stable`: shared platform primitives for feature flags, jobs, rate limits, bot protection, and compliance hooks
- `guided`: Resend-backed email delivery and related product flows when email integration is enabled
- `later`: audit logs, multi-workspace UX, ownership transfer, webhooks, advanced support tooling, deeper billing automation

Keep generated guidance honest. If a capability is only scaffolded as a hook or placeholder, say that explicitly instead of presenting it as a complete subsystem.

## Mobile Stack

Current mobile DX recommendations:

- Expo SDK 55 / React Native 0.84 in the repo should be kept current with Expo's stable line.
- Prefer development builds over long-term Expo Go usage for production-grade apps.
- Use Expo Orbit for one-click simulator/device launches and build installs.
- Keep React Native New Architecture assumptions in mind when evaluating third-party libraries.

## Repo Standards

- Use `jj` locally and keep Git interop intact.
- Use `forge` from `../ForgeGraph` for real deployment workflows.
- Keep `.forgegraph.yaml` checked in as the per-repo ForgeGraph metadata surface.
- Expose the common ForgeGraph workflow through repo scripts such as `pnpm forge:init`, `pnpm forge:doctor`, and `pnpm forge:status`.
- Keep docs current when framework, deployment, or agent conventions change.
- Favor shared standards over vendor-specific sprawl.
