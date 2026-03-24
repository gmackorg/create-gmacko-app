# Deployment Guidance

The recommended deployment path for this template is:

1. Keep the app in a ForgeGraph-managed repo.
2. Deploy it to the Hetzner VPS using the ForgeGraph setup in [`../ForgeGraph`](../ForgeGraph).
3. Run Postgres alongside the app first.
4. Migrate to hosted Postgres later, once customer demand and operational pressure justify it.

This repository used to ship several different deployment paths. Those legacy assets have been removed from the template so new repos start from the ForgeGraph + Nix direction instead of inheriting dead deployment branches.

## Preferred Path: ForgeGraph on Hetzner

Use ForgeGraph as the deployment control plane and keep the application repo aligned with that model.

### Recommended Operating Model

- App and Postgres live together on the same VPS in the early stage.
- Secrets and runtime configuration are managed in ForgeGraph.
- The app should move toward a Nix-based deployment setup so build and runtime behavior are reproducible.
- Hosted Postgres is a later optimization, not the starting point.

### Early-Stage Database Guidance

Use a standard Postgres instance deployed beside the application. That keeps the initial system cheap, debuggable, and easy to operate. The included local `docker-compose.yml` is the same operating model you should prefer in the early production stage: one app deployment and one Postgres deployment, managed together.

When it is time to migrate off the colocated database, do it for a concrete reason such as:

- sustained customer traffic
- backup or failover requirements
- operational isolation requirements
- team capacity to own another external dependency well

## ForgeGraph Checklist

For new deployments, the intended shape is:

```text
ForgeGraph repo
├── app deployment
├── postgres deployment
├── env + secret management
└── Nix-based build and runtime definitions
```

In this workspace, use [`../ForgeGraph`](../ForgeGraph) as the reference implementation for that deployment model.

The generated repo also includes a small handoff directory at [`deploy/forgegraph/README.md`](./forgegraph/README.md) for the app-side deployment contract.
If you intentionally want a Workers deployment lane, use [`deploy/cloudflare/README.md`](./cloudflare/README.md) as the current support note rather than mixing Cloudflare assumptions into the ForgeGraph path.

## Legacy Context

Older plans and notes in this repository may still mention:

- older hosted-preview deployment flows
- preview-specific infrastructure manifests
- retired deployment experiments
- provider-specific preview database automation

Treat those references as historical context rather than current template guidance.

## Preview Deployments

Preview deployments create isolated environments for each pull request, enabling reviewers to test changes before merging.

### How It Works

1. **On PR Open/Update**: The workflow builds a Docker image tagged with the PR number and deploys to a unique URL
2. **PR Comment**: A bot comment is posted/updated with the preview URL
3. **On PR Close**: All preview resources are automatically cleaned up

### Configuration

The template no longer ships platform-specific preview deployment manifests. If you want preview environments, model them in ForgeGraph directly and keep the database strategy simple unless stronger isolation is warranted.

### Required Secrets

**For self-hosted previews:**

```
PREVIEW_DATABASE_URL - Database URL for preview environments
PREVIEW_AUTH_SECRET  - Auth secret for preview environments
```

### Preview URLs

Previews are accessible at: `https://pr-{number}.preview.gmacko.io`

### Database Isolation

Two strategies are documented in the current codebase, but the preferred early-stage default is to keep previews simple and share infrastructure conservatively:

1. **Schema Isolation**: Set `PREVIEW_USE_SCHEMA_ISOLATION=true` to use PR-specific schemas in the same database
2. **Dedicated Preview Database**: Set `PREVIEW_DATABASE_URL` to a dedicated Postgres instance when you truly need stronger isolation

### Preview Implementation

This template now leaves preview infrastructure implementation to ForgeGraph instead of shipping stale Kubernetes manifests that are no longer part of the recommended path.

### Preview Configuration API

Use `@gmacko/config/preview` in your application:

```typescript
import {
  getPreviewConfig,
  getPreviewFeatureFlags,
  isPreviewEnvironment,
} from "@gmacko/config/preview";

// Check if in preview
if (isPreviewEnvironment()) {
  const { prNumber, domain } = getPreviewConfig();
  const flags = getPreviewFeatureFlags();

  // flags.disablePayments - true in preview
  // flags.showPreviewBanner - true in preview
}
```

## Health Check

All deployments have a health check endpoint at `/api/health` that returns:

```json
{
  "status": "ok",
  "timestamp": "2025-01-12T00:00:00.000Z"
}
```
