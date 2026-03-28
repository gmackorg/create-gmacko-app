# SaaS Scaffold Proposal

This proposal captures the next major expansion of `create-gmacko-app`: turning the template into a real SaaS starter instead of only a framework/infrastructure starter.

## Workflow

1. Use `superpowers:brainstorming` to turn the raw idea into a concrete proposal and write the result into this file.
2. Run `/plan-ceo-review` to tighten the problem statement, user value, and scope.
3. Run `/plan-eng-review` to translate the approved scope into `docs/ai/IMPLEMENTATION_PLAN.md`.
4. Run `/design-consultation` to establish the design philosophy and generate `DESIGN.md`.

## Problem

The template already gives teams a strong repo, deployment, AI-agent, and framework baseline, but it still leaves too much of the actual SaaS product spine to greenfield work. New apps still need to invent their own workspace model, onboarding, billing shape, support surface, public shell, admin settings, launch controls, and operator tooling. That slows down the first meaningful week of product work and makes generated apps feel like polished shells instead of serious SaaS foundations.

## Users

The primary users are small product teams and solo founders who want to launch a modern SaaS quickly without accepting a shallow starter. They need a generated app that already understands workspaces, onboarding, access control, billing shape, support flows, growth surfaces, and AI-assisted follow-up work. Internal maintainers of this template are also users: they need a clear opt-in matrix and a consistent monorepo model so new SaaS capabilities do not collapse into an unmaintainable kitchen sink.

## Core Experience

The generated app should start with a guided first-run setup instead of a half-configured blank shell. An operator should be able to initialize the app, create the first platform admin, create the first user, and create the first named workspace in one flow. From there, the app should expose a workspace-centric SaaS structure with optional layers selected in the onboarding wizard: collaboration, billing, limits, metering, support, marketing shell, waitlist, referrals, feature flags, jobs, compliance, and operator APIs.

The public side should also feel product-ready from day one. A generated app should be able to ship with a landing page, pricing, FAQ, changelog, contact/support flow, legal pages, optional waitlist mode, and controlled signup behavior. After scaffold, the repo should recommend the next Claude/Codex/OpenCode workflows and optional skills to help the team tailor onboarding, design, mobile, billing, and marketing to the specific product.

## Scope

### Must-have v1 capabilities

- Guided first-run bootstrap UI for uninitialized apps.
- Workspace-centric SaaS model with one visible workspace per user in v1.
- Future-friendly membership schema even though multi-workspace UX stays out of v1.
- Workspace naming during onboarding.
- Separate workspace roles and platform admin roles.
- Separate wizard opt-ins for SaaS capability layers instead of one giant bundle.
- Optional collaboration layer with invites.
- Optional billing layer with per-workspace plans, limits, and optional metering.
- Optional support/content layer with contact, tickets, FAQ, changelog, and pricing.
- Optional launch/growth layer with waitlist, referral tracking, admin waitlist review, maintenance mode, signup toggle, and allowlists.
- Optional operator lane with CLI and MCP wrappers around the same tRPC API.
- Feature flags, background jobs, rate limiting, and bot protection as shared platform primitives where relevant.
- Email-driven flows when `Resend` is enabled.
- Admin settings as the home for global app settings and provider configuration.
- Generated AI workspace docs and follow-up skill recommendations based on scaffold choices.

### Explicit non-goals for this phase

- Multi-workspace switching UX.
- Ownership transfer flow.
- Advanced audit logging.
- Webhooks framework.
- Search.
- Experimentation / A/B testing.
- First-party incident management or status tooling.
- Generic custom-fields/metadata layer.
- Heavy storage/media pipeline.
- Full permissions policy editor.

## Constraints

- Preserve the repo’s stable direction: ForgeGraph + Nix + colocated Postgres + `jj`.
- Keep Cloudflare and `vinext` as separate lanes rather than polluting the default runtime assumptions.
- Keep generated behavior opt-in and modular; do not force every SaaS feature into every app.
- Keep the schema explicit and understandable even while staying future-friendly.
- Align with Better Auth, tRPC, Drizzle, and the existing monorepo package boundaries where possible.
- Keep the generated app portable across Claude, Codex, and OpenCode.
- Avoid touching unrelated in-progress `create-site` work unless explicitly requested.

## Success

This launch is successful if a generated app feels like a credible early-stage SaaS foundation on day one: it can initialize itself cleanly, ship with a real public shell, expose a useful workspace/admin/settings structure, support optional business-critical layers without schema rewrites, and hand the team directly into the right AI-assisted next steps instead of forcing them to invent the product spine from scratch.
