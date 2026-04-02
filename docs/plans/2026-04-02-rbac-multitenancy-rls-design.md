# RBAC, Multi-Tenancy, And Postgres RLS Design

## Decisions

- Tenancy mode is selected at scaffold time in `create-gmacko-app`.
- The tenant boundary is called `workspace`.
- Single-tenant and multi-tenant apps share the same workspace-based schema.
- Platform admins do not bypass tenant boundaries in Postgres.
- RBAC uses fixed roles:
  - Platform roles: `user | admin`
  - Workspace roles: `owner | admin | member`
- Workspace selection uses a hybrid model:
  - Web prefers URL-scoped workspace context.
  - Mobile/native may persist the active workspace in session state.
  - The server normalizes both inputs into one workspace context before DB access.

## Architecture

The generator should add a tenancy mode prompt with `single-tenant` and `multi-tenant` options. That value becomes generated config alongside the existing SaaS layer flags and drives what routes, settings surfaces, and onboarding flows are visible in the scaffolded app.

Both modes use the same workspace-centric data model. In `single-tenant`, bootstrap creates one primary workspace, the UI hides workspace switching, and workspace-scoped queries resolve to that workspace. In `multi-tenant`, the app exposes workspace switching, membership-aware navigation, and workspace management surfaces.

RBAC stays split between platform and workspace domains. Platform admin is only for operator-wide features such as launch controls, user administration, and global settings. Workspace membership drives product permissions inside a tenant. A platform admin only gains tenant access by also being a member of that workspace.

Postgres RLS becomes the hard isolation boundary. Workspace-owned rows must include `workspace_id`. Tenant-aware DB access sets `app.user_id`, `app.workspace_id`, and `app.tenancy_mode` in the database session, and policies allow access only when the user is a member of the active workspace. Insert and update policies must verify the row workspace matches the active session workspace.

## Components

- `packages/create-gmacko-app`
  - Add tenancy mode to CLI flags, prompt flow, and generated manifest/config.
  - Keep collaboration separate from tenancy so multi-tenant apps can omit invite UX.
- `packages/config`
  - Export generated tenancy config and helper predicates.
- `packages/db`
  - Add tenancy enums and settings fields.
  - Add tenant-aware DB context helpers for local Postgres settings.
  - Add SQL helpers for RLS enablement/policy creation.
- `packages/api`
  - Resolve active workspace explicitly in tRPC context.
  - Replace ad hoc “first membership” lookups with shared workspace context resolution.
  - Add workspace listing/selection primitives for runtime consumers.
- `apps/nextjs` and `apps/expo`
  - Read generated tenancy config.
  - Keep single-tenant UX simple.
  - Expose multi-tenant workspace switching only in the multi-tenant branch.

## Error Handling

- Missing workspace context in multi-tenant mode returns a typed failure or redirect, not silent fallback.
- Access to a workspace without membership returns `FORBIDDEN`.
- RLS rejections are treated as authorization failures, not converted into “not found” unless the route explicitly wants that behavior.
- Single-tenant mode may bootstrap a default workspace, but should still fail loudly if settings and membership state drift out of sync.

## Testing

- Scaffold tests must verify tenancy selection, generated config, and branch-specific output.
- Schema tests must verify tenancy enums, settings shape, and workspace-owned tables.
- API tests must verify explicit workspace resolution, cross-tenant denial, and no platform-admin bypass.
- DB integration tests must verify RLS at the Postgres layer for read, insert, update, and delete behavior.
