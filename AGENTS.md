# Agent Workflow

This repository is set up to work well with `Codex`, `Claude Code`, and `OpenCode`.

## Canonical Instructions

- Treat this file as the shared, repo-level instruction source.
- Keep `docs/ai/INITIAL_PROPOSAL.md`, `docs/ai/IMPLEMENTATION_PLAN.md`, and `DESIGN.md` aligned with major product and implementation changes.
- Prefer `jj` for local version control workflows. The repo is colocated with Git for interoperability.
- Use `pnpm`, `oxlint`, `biome`, and `turbo` as the default tooling surface.
- Use ForgeGraph for deployment workflows and `forge` from [`../ForgeGraph`](../ForgeGraph) when working against the real deployment control plane.
- Treat [docs/ai/DEVELOPER_EXPERIENCE.md](./docs/ai/DEVELOPER_EXPERIENCE.md) as the current support matrix for agent tooling, Cloudflare Workers, ForgeGraph, Nix, and mobile DX choices.
- When the optional SaaS bootstrap pack is scaffolded, keep the generated bootstrap playbook feature-aware across `Claude-only`, `Codex`, and `OpenCode` sections, and keep Claude-only slash commands labeled as such.

## Planning Flow

1. Turn the raw idea into a proposal in `docs/ai/INITIAL_PROPOSAL.md`.
2. Refine that proposal into `docs/ai/IMPLEMENTATION_PLAN.md`.
3. Write or update `DESIGN.md` when UI, product tone, or interaction patterns change materially.
4. Keep implementation work anchored to the current docs instead of stale conversation context.

## Agent-Specific Notes

### Codex

- Codex reads `AGENTS.md` directly, so keep repo conventions here rather than scattering them across tool-specific files.
- If `.mcp.json` is present, use the configured MCP servers when available before falling back to manual inspection.
- Keep the repo portable across agents. Prefer shared docs and repo files over Codex-only conventions.

### Claude Code

- `CLAUDE.md` exists as the Claude-specific entrypoint for slash-command workflows and points back to this file for shared repo rules.
- Use the vendored `.claude/skills/gstack` commands when they match the task.
- Project hooks belong in `.claude/settings.json`, not in this file.
- Project subagents belong in `.claude/agents/` when they are narrow and reusable.
- This repo ships `.claude/settings.json` with `../ForgeGraph` available as an additional working directory.
- The generated SaaS bootstrap handoff should keep Claude-only slash commands separate from the repo-level guidance used by Codex and OpenCode.

### OpenCode

- OpenCode prefers `AGENTS.md` over `CLAUDE.md`, so keep duplicated guidance to a minimum.
- `opencode.json` should reference this file plus any high-signal planning docs that should always be loaded.
- Use OpenCode agents and rules for bounded task specialization, but keep repo conventions centralized here.
- Keep shared supplemental instructions in `opencode.json` instead of bloating `AGENTS.md`.
- The generated SaaS bootstrap handoff should point OpenCode at the same repo-level follow-ups as Codex, not at Claude-only slash commands.
