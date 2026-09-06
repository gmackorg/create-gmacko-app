# Metrics & Alerting Guidelines

This document defines the metrics collection strategy, alerting rules, and
dashboard recommendations for products built from create-gmacko-app.

## Metrics Collection

### Architecture

The Worker has no scrape endpoint and no process to instrument. Metrics,
traces, and logs leave it by push:

```
┌──────────────────────┐   OTLP/HTTP (waitUntil)   ┌──────────────────────┐
│  Cloudflare Worker   │──────────────────────────▶│  OTLP collector       │
│  @gmacko/telemetry   │                           │  (Grafana Cloud,      │
│  Observability.layer │                           │   Honeycomb, Datadog, │
└──────────┬───────────┘                           │   self-hosted otel)   │
           │ console JSON                          └──────────┬───────────┘
           ▼                                                  ▼
┌──────────────────────┐                           ┌──────────────────────┐
│  Workers Logs /      │                           │  Dashboards +        │
│  Logpush             │                           │  Alerting            │
└──────────────────────┘                           └──────────────────────┘
```

- `OTEL_EXPORTER_OTLP_ENDPOINT` (+ `OTEL_EXPORTER_OTLP_HEADERS`) turns the
  export on; unset means console logs only.
- Sentry (`SENTRY_DSN`) receives errors independently of OTLP.
- Cloudflare's own analytics (requests, errors, CPU time, D1 Insights) need
  no configuration.

### Built-in Signals

| Signal | Kind | Attributes | Description |
|--------|------|------------|-------------|
| `http.server.duration` | Histogram (ms) | `group.endpoint`, status | Latency per contract endpoint |
| `group.endpoint` span | Trace | `http.response.status_code`, request id | One span per API call; declared 4xx end successfully, 500 and defects fail |
| `sql.execute` span | Trace | statement, `db.system.name = sqlite` | Every D1 statement, under the endpoint span |
| `RateLimited` | Log + 429 | scope, `Retry-After` | Rate-limit hits per `RateLimit` scope (`contact`, `api-keys`, `operator-api`) |
| Cloudflare: requests, errors, CPU time, subrequests | Workers analytics | Worker, status | Platform-level throughput and error rate |
| Cloudflare: `rows_read`, `rows_written`, query duration | D1 Insights | query | Database load; the 10 GB size cap is `wrangler d1 info DB` |

### Custom Metrics

Add business metrics with Effect's `Metric` API; `@gmacko/telemetry` exports
whatever the runtime records:

```typescript
import { Metric } from "effect";

const featureUsage = Metric.counter("feature_usage_total", {
  description: "Feature usage tracking",
});

// inside a service or handler
yield* Metric.update(featureUsage, 1).pipe(
  Effect.tagMetrics({ feature: "export", plan: "pro" }),
);
```

## Alerting Rules

Expressed against the OTLP-derived series; translate to your backend's
query language.

### Critical (SEV-1) — Immediate Response

| Alert | Condition | For | Action |
|-------|-----------|-----|--------|
| **ServiceDown** | `/api/health/ready` fails (external monitor) | 2m | Page on-call, check Cloudflare status and the last deploy |
| **HighErrorRate** | 5xx share of `http.server.duration` > 5% | 5m | Page on-call, check Sentry and `wrangler tail` |
| **DatabaseDown** | `/api/health/ready` returns 503 `Unhealthy` | 1m | Page on-call, check D1 status, `wrangler d1 info` |
| **DeployMigrationFailed** | `pnpm deploy:<stage>` exits before `wrangler deploy` | — | Fix forward with a new migration; the previous Worker keeps serving |

### Warning (SEV-2) — Response within 1 hour

| Alert | Condition | For | Action |
|-------|-----------|-----|--------|
| **HighLatency** | p95 `http.server.duration` > 2000 ms | 10m | Investigate slow endpoints by `group.endpoint` |
| **HighDBLatency** | p95 `sql.execute` > 1000 ms | 10m | Check slow statements, add indexes (expand-only migration) |
| **RateLimitSpike** | 429 count > 100/min on one scope | 10m | Abuse or a misbehaving client; review keys |
| **D1SizeGrowth** | `database_size` > 8 GB | — | Plan a split before the 10 GB cap |
| **CPUTime** | Workers CPU time p99 near the plan limit | 10m | Profile the endpoint; move work to `Background.run` |

### Informational (SEV-3/4) — Next business day

| Alert | Condition | For | Action |
|-------|-----------|-----|--------|
| **DependenciesOutdated** | CI weekly check fails | — | Review Renovate PRs |
| **PreviewDatabaseDrift** | Pending migrations on `gmacko-web-preview` | — | Merge or close the PR that added them |

## Dashboard Recommendations

### 1. Service Overview Dashboard

**Panels:**
- Request rate (requests/second) — timeseries (Cloudflare analytics)
- Error rate (%) — timeseries with threshold line at 1%
- P50/P95/P99 `http.server.duration` — timeseries, split by `group.endpoint`
- Health probe status — stat panel

### 2. Database Dashboard

**Panels:**
- `sql.execute` rate and latency — timeseries
- D1 `rows_read` / `rows_written` — timeseries (D1 Insights)
- Slow statements (>1s) — table from traces
- `database_size` — gauge against the 10 GB cap

### 3. Business Metrics Dashboard

**Panels:**
- Active users — timeseries
- Feature usage breakdown — bar chart
- Plan distribution — pie chart
- API key usage by endpoint — table (from `group.endpoint` spans with a bearer credential)
- Revenue metrics (from Stripe) — stat panels

### 4. Auth & Abuse Dashboard

**Panels:**
- 401 / 403 by reason (`scope`, `origin`, `role`) — timeseries
- 429 by `RateLimit` scope — timeseries
- Sign-ins by provider — bar chart

## Setup Guide

### Option A: Grafana Cloud (Recommended for SaaS)

1. Create a Grafana Cloud stack and an OTLP endpoint token
2. `forge secret set OTEL_EXPORTER_OTLP_ENDPOINT https://otlp-gateway-<region>.grafana.net/otlp --stage production`
   and `OTEL_EXPORTER_OTLP_HEADERS "Authorization=Basic <token>"`, then `pnpm secrets:push --stage production`
3. Build the dashboards above from the `http.server.duration` and span data
4. Set up alerting rules in Grafana Alerting

### Option B: Self-hosted OpenTelemetry Collector

1. Run an OTLP/HTTP receiver reachable from Cloudflare (public HTTPS)
2. Point `OTEL_EXPORTER_OTLP_ENDPOINT` at it; fan out to Prometheus, Loki, Tempo
3. Configure Alertmanager for notifications:
   ```yaml
   receivers:
     - name: 'pagerduty'
       pagerduty_configs:
         - service_key: '<PD_SERVICE_KEY>'
     - name: 'slack'
       slack_configs:
         - channel: '#alerts'
           api_url: '<SLACK_WEBHOOK_URL>'
   ```

### Option C: Datadog / Honeycomb / New Relic

All accept OTLP/HTTP directly; set the endpoint and the vendor's auth header
in `OTEL_EXPORTER_OTLP_HEADERS`.

## Environment Variables

```bash
# Worker bindings (set through ForgeGraph, pushed with pnpm secrets:push)
OTEL_EXPORTER_OTLP_ENDPOINT='https://otlp.example.com'
OTEL_EXPORTER_OTLP_HEADERS='Authorization=Bearer <token>'
SENTRY_DSN='https://...@sentry.io/...'
```

Locally, the same keys in the repo-root `.env` export to a local collector;
leave them unset to keep console logs only.
