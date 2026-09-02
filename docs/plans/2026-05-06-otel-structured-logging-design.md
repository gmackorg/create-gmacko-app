# OpenTelemetry & Structured Logging Design

**Date:** 2026-05-06
**Status:** Approved

## Decisions

| Decision | Choice |
|---|---|
| Telemetry pipeline | OTel Collector as gateway |
| Signals | All three (traces, metrics, logs) — tracing first |
| Sentry relationship | Sentry for errors, OTel for everything else — no coupling |
| Collector topology | One per Hetzner node (Docker container) |
| Backend | Grafana stack (Tempo + Prometheus + Loki) with stdout fallback |
| Instrumentation | Selective auto + manual for business logic |

## Package Architecture

### `@gmacko/telemetry` (new)

Core OTel SDK setup. Exports `initTelemetry()` to configure trace provider, meter provider, and OTLP exporters. Only package that depends on `@opentelemetry/*`. Apps call it once at startup via Next.js `instrumentation.ts`.

Dependencies:
- `@opentelemetry/sdk-node`
- `@opentelemetry/exporter-trace-otlp-http`
- `@opentelemetry/exporter-metrics-otlp-http`
- `@opentelemetry/instrumentation-http`
- `@opentelemetry/instrumentation-pg`
- `@opentelemetry/instrumentation-fetch`
- `@opentelemetry/host-metrics`

Exports:
- `initTelemetry()` — one-time SDK setup
- `withSpan(name, fn)` — manual span helper
- `getMetrics()` — pre-configured meter instruments

### `@gmacko/logging` (extended)

Already has Pino. Extensions:
- Trace context mixin: injects `traceId` and `spanId` from active OTel context into every log line
- OTLP log transport: ships logs to collector alongside traces/metrics
- stdout always active as fallback

### `@gmacko/monitoring` (unchanged)

Sentry stays focused on error tracking. Shared contract: both read `SERVICE_NAME` and `DEPLOY_ENV` env vars.

### Env vars (added to `turbo.json`)

- `OTEL_EXPORTER_OTLP_ENDPOINT` — collector URL (default: `http://localhost:4318`)
- `OTEL_SERVICE_NAME` — falls back to `SERVICE_NAME`
- `OTEL_ENABLED` — kill switch, defaults to `true`

## Instrumentation

### Auto-instrumented (zero code changes)

- `instrumentation-http` — incoming/outgoing HTTP requests
- `instrumentation-pg` — Drizzle/pg queries with SQL statements
- `instrumentation-fetch` — outbound fetch (OAuth providers, external APIs)

### Manual (targeted)

- **tRPC middleware** — wraps each procedure in a span `trpc.<router>.<procedure>`. Replaces current `console.log` timing middleware. ~30 lines in `@gmacko/api`.
- **Auth flows** — spans around better-auth session validation and OAuth token exchange in `@gmacko/auth`.
- **Ad-hoc** — `withSpan(name, fn)` helper for one-off manual spans.

### Span attributes convention

| Layer | Attributes |
|---|---|
| All spans | `service.name`, `deployment.environment` |
| tRPC | `rpc.system: "trpc"`, `rpc.method: "<procedure>"` |
| Database | `db.system: "postgresql"`, `db.statement` (auto) |
| HTTP | `http.method`, `http.route`, `http.status_code` (auto) |

## Metrics

### Auto (from OTel instrumentation)

- `http.server.request.duration` — incoming request latency histogram
- `http.server.active_requests` — in-flight request gauge
- `http.client.request.duration` — outbound HTTP latency
- `db.client.operation.duration` — database query latency

### Custom application metrics

- `trpc.procedure.duration` — histogram, per-procedure latency
- `trpc.procedure.errors` — counter, per-procedure by error code
- `auth.session.validations` — counter, hit/miss
- `auth.oauth.exchanges` — counter by provider
- `app.health.status` — gauge, 1=healthy 0=degraded

### Runtime metrics (`@opentelemetry/host-metrics`)

- `process.runtime.nodejs.memory.heap.used`
- `process.runtime.nodejs.event_loop.delay`
- `process.cpu.utilization`

## Structured Logging

### Trace correlation

Every Pino log line includes `traceId` and `spanId` from active OTel context:

```json
{"level":"info","msg":"user created","traceId":"abc123","spanId":"def456","userId":"u_7"}
```

### Dual output

1. **stdout** — always active. `pino-pretty` in dev, JSON in production. Container runtime captures it. Works without collector.
2. **OTLP transport** — ships to collector when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Collector forwards to Loki.

### console.log migration

- Not big-bang. Create `log` instance per package (`createLogger({ module: "api" })`).
- Replace high-value paths first: tRPC middleware, auth, health checks, DB errors.
- ESLint `no-console: warn` — surfaces new violations in CI without blocking.
- Remaining calls migrated organically as files are touched.

### Log levels

| Level | Usage |
|---|---|
| `error` | Unrecoverable failures, exceptions |
| `warn` | Degraded state, retries, fallbacks |
| `info` | Request lifecycle, key business events |
| `debug` | Verbose detail, off by default in production |

## Infrastructure

### OTel Collector (per node)

`docker-compose.otel.yml` in repo root. Config: `otel-collector-config.yaml`.

- **Receivers:** OTLP/HTTP on `:4318`
- **Processors:** `batch` (5s/1000 items), `resource` (add `node.name`), `memory_limiter` (80% cap)
- **Exporters:**
  - `otlphttp/tempo` — traces
  - `prometheusremotewrite` — metrics
  - `otlphttp/loki` — logs
  - `logging` — stdout fallback (`warn`+ only)

### Grafana stack (`hetzner-master`)

`docker-compose.grafana.yml`:

- **Tempo** — trace storage, local filesystem, 7-day retention
- **Prometheus** — metrics, 30-day retention, remote write receiver
- **Loki** — logs, local filesystem, 14-day retention
- **Grafana** — dashboards, pre-provisioned datasources

Exposed on Tailscale only. Grafana at `http://hetzner-master:3001`.

### Local dev

No collector needed. Empty `OTEL_EXPORTER_OTLP_ENDPOINT` disables OTLP export. Logs go to stdout with `pino-pretty`. Optional: `docker compose -f docker-compose.otel.yml up` for local collector + trace viewing.

## Rollout

### Phase 1 — Foundation (this PR)

- Create `@gmacko/telemetry` package
- Extend `@gmacko/logging` with trace mixin + OTLP transport
- Wire into `apps/nextjs/src/instrumentation.ts`
- Add tRPC OTel middleware replacing `console.log` timer
- Add `no-console: warn` ESLint rule
- Add `docker-compose.otel.yml` + `otel-collector-config.yaml`
- Add `docker-compose.grafana.yml`

### Phase 2 — Manual instrumentation (follow-up)

- Auth flow spans in `@gmacko/auth`
- Custom business metrics
- Replace high-value `console.log` calls
- Pre-built Grafana dashboards (RED metrics, Node.js runtime)

### Phase 3 — Hardening (organic)

- Migrate remaining `console.log` calls
- Tune sampling rates
- Add Grafana alerting rules
- Consider TanStack Start and Expo instrumentation

### Out of scope

- Sentry migration or coupling
- Browser/client-side tracing (RUM)
- Log-based alerting
- Custom Grafana dashboards beyond basics
