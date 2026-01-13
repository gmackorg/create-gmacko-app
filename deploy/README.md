# Deployment Options

This template supports three deployment targets for the Next.js web app.

## Vercel (Recommended for simplicity)

The app works with Vercel out of the box:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Set environment variables in the Vercel dashboard.

## Kubernetes

For self-hosted Kubernetes clusters:

### Build and Push Docker Image

```bash
# From repo root
docker build -t your-registry/gmacko-web:latest -f apps/nextjs/Dockerfile .
docker push your-registry/gmacko-web:latest
```

### Create Secrets

```bash
kubectl create secret generic gmacko-env \
  --from-literal=DATABASE_URL='...' \
  --from-literal=AUTH_SECRET='...' \
  --from-literal=AUTH_DISCORD_ID='...' \
  --from-literal=AUTH_DISCORD_SECRET='...'
```

### Deploy

```bash
# Replace variables in manifest
export IMAGE_TAG=your-registry/gmacko-web:latest
export DOMAIN=app.yourdomain.com

envsubst < deploy/k8s/deployment.yaml | kubectl apply -f -
```

## SST (AWS)

For AWS deployment using SST v3:

### Setup

```bash
# Install SST
curl -fsSL https://sst.dev/install | bash

# Copy SST config to root
cp deploy/sst/sst.config.ts sst.config.ts

# Initialize SST
sst init
```

### Set Secrets

```bash
sst secret set DatabaseUrl "postgresql://..."
sst secret set AuthSecret "your-auth-secret"
sst secret set AuthDiscordId "your-discord-id"
sst secret set AuthDiscordSecret "your-discord-secret"
```

### Deploy

```bash
# Development
sst dev

# Production
sst deploy --stage production
```

## Preview Deployments

Preview deployments create isolated environments for each pull request, enabling reviewers to test changes before merging.

### How It Works

1. **On PR Open/Update**: The workflow builds a Docker image tagged with the PR number and deploys to a unique URL
2. **PR Comment**: A bot comment is posted/updated with the preview URL
3. **On PR Close**: All preview resources are automatically cleaned up

### Configuration

Set the `DEPLOY_TARGET` repository variable to choose the deployment platform:

- `vercel` (default): Deploy to Vercel preview environments
- `kubernetes`: Deploy to self-hosted Kubernetes cluster

### Required Secrets

**For Kubernetes:**

```
KUBE_CONFIG          - Base64-encoded kubeconfig
PREVIEW_DATABASE_URL - Database URL for preview environments
PREVIEW_AUTH_SECRET  - Auth secret for preview environments
```

**For Vercel:**

```
VERCEL_TOKEN      - Vercel authentication token
VERCEL_ORG_ID     - Vercel organization ID
VERCEL_PROJECT_ID - Vercel project ID
```

### Preview URLs

Previews are accessible at: `https://pr-{number}.preview.gmacko.io`

### Database Isolation

Two strategies are supported for preview database isolation:

1. **Neon Branch Database** (recommended): Set `PREVIEW_DATABASE_URL` to a Neon branch connection string
2. **Schema Isolation**: Set `PREVIEW_USE_SCHEMA_ISOLATION=true` to use PR-specific schemas in the same database

### Kubernetes Manifests

Preview K8s manifests are in `deploy/k8s/preview/`:

```
deploy/k8s/preview/
├── namespace.yaml   # PR-specific namespace with resource quotas
├── deployment.yaml  # App deployment with security context
├── service.yaml     # ClusterIP service
├── ingress.yaml     # Ingress with TLS and rate limiting
├── secret.yaml      # Environment secrets
└── kustomization.yaml
```

All manifests support `envsubst` templating with these variables:

- `${PR_NUMBER}` - Pull request number
- `${IMAGE_TAG}` - Docker image tag
- `${PREVIEW_DOMAIN}` - Full preview domain
- `${DATABASE_URL}` - Database connection string

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
