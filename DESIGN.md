# Design Philosophy

This file should be rewritten with `/design-consultation`.

## Workflow

1. Start from the approved product direction in `docs/ai/INITIAL_PROPOSAL.md`.
2. Run `/design-consultation` to define the visual system, interaction tone, and product-specific design risks worth taking.
3. Capture the resulting principles, palettes, typography rules, motion guidance, and representative screens here.
4. Re-run `/design-consultation` or `/design-review` when the product direction changes materially.

## Current Product Notes

- The scaffold now needs two product branches: `single-tenant` and `multi-tenant`.
- Both branches should preserve one workspace-based mental model in the UI even when the single-tenant branch hides switching.
- Workspace selection should be explicit and legible in multi-tenant surfaces instead of implied by hidden state.
- Operator/admin screens should stay visually distinct from workspace-scoped product screens because platform admin is not a tenant-data bypass.
