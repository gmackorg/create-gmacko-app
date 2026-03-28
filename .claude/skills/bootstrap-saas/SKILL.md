---
name: bootstrap-saas
description: Use when a freshly scaffolded SaaS repo has finished local setup and the next step is shaping the product and execution path in Claude Code - runs the post-setup flow through /office-hours, optional /autoplan, /design-consultation, and the local follow-up skills in the right order
---

# Bootstrap SaaS

Run this after `pnpm bootstrap:local`.

## Order

1. Run `/office-hours`.
2. If your user-level gstack install includes `/autoplan`, run it next.
3. Run `/design-consultation`.
4. Then pick the local follow-up skill that matches the next workstream:
   - `/launch-landing-page`
   - `/setup-stripe-billing`
   - `/bootstrap-expo-app`
   - `/test-mobile-with-maestro`

## Rule

Do not jump straight into implementation before the product direction and design direction exist in `docs/ai` and `DESIGN.md`.
