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

## Health Check

All deployments have a health check endpoint at `/api/health` that returns:

```json
{
  "status": "ok",
  "timestamp": "2025-01-12T00:00:00.000Z"
}
```
