# OTel & Structured Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OpenTelemetry tracing, metrics, and structured logging to the monorepo. Decommission unused Sentry perf helpers. Make the app debuggable in production.

**Architecture:** New `@gmacko/telemetry` package owns all OTel SDK deps. `@gmacko/logging` gets trace-context injection and Sentry perf cleanup. tRPC timing middleware replaced with OTel spans. Conditional on `integrations.telemetry` toggle.

**Tech Stack:** `@opentelemetry/sdk-node` 0.217.x, `@opentelemetry/api` 1.9.x, Pino 10.x. No Docker infra in this PR (deferred).

**Review notes:** This plan was reviewed by /autoplan (CEO + Eng dual voices). Key revisions:
- Removed Tasks 9-10 (Docker/Grafana infra) — deferred to separate PR
- Replaced `@opentelemetry/instrumentation-pg` with Drizzle logger-based spans (repo uses postgres-js, not pg)
- Added try/catch to `initTelemetry()` for resilience
- Added integration toggle to `@gmacko/config`
- Decommissioned Sentry perf helpers from `@gmacko/logging`
- Tests use `InMemorySpanExporter` for real span assertions
- Fixed dependency boundaries (OTel API re-exported from @gmacko/telemetry)

---

### Task 1: Create `@gmacko/telemetry` package scaffold

**Files:**
- Create: `packages/telemetry/package.json`
- Create: `packages/telemetry/tsconfig.json`
- Create: `packages/telemetry/vitest.config.ts`
- Create: `packages/telemetry/src/index.ts`

**Step 1: Create `packages/telemetry/package.json`**

```json
{
  "name": "@gmacko/telemetry",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./src/index.ts"
    },
    "./testing": {
      "types": "./dist/testing.d.ts",
      "default": "./src/testing.ts"
    }
  },
  "license": "MIT",
  "scripts": {
    "build": "tsc",
    "clean": "git clean -xdf .cache .turbo dist node_modules",
    "dev": "tsc --watch",
    "format": "biome check .",
    "lint": "oxlint .",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit --emitDeclarationOnly false"
  },
  "dependencies": {
    "@gmacko/config": "workspace:*",
    "@opentelemetry/api": "^1.9.1",
    "@opentelemetry/sdk-node": "^0.217.0",
    "@opentelemetry/sdk-metrics": "^1.30.1",
    "@opentelemetry/sdk-trace-base": "^1.30.1",
    "@opentelemetry/sdk-logs": "^0.217.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.217.0",
    "@opentelemetry/exporter-metrics-otlp-http": "^0.217.0",
    "@opentelemetry/instrumentation-http": "^0.217.0",
    "@opentelemetry/instrumentation-fetch": "^0.217.0",
    "@opentelemetry/host-metrics": "^0.38.3",
    "@opentelemetry/resources": "^1.30.1",
    "@opentelemetry/semantic-conventions": "^1.34.0"
  },
  "devDependencies": {
    "@biomejs/biome": "catalog:",
    "@gmacko/tsconfig": "workspace:*",
    "@gmacko/vitest-config": "workspace:*",
    "@types/node": "catalog:",
    "oxlint": "catalog:",
    "typescript": "catalog:",
    "vitest": "^4.1.0"
  }
}
```

Note: `@opentelemetry/instrumentation-pg` is NOT included. The repo uses `postgres` (postgres-js), not `pg`. DB instrumentation is done manually via Drizzle's logger.

**Step 2: Create `packages/telemetry/tsconfig.json`**

```json
{
  "extends": "@gmacko/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create `packages/telemetry/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
```

**Step 4: Create `packages/telemetry/src/index.ts`**

```ts
export {};
```

**Step 5: Install dependencies**

Run: `pnpm install`
Expected: lockfile updates, no errors.

**Step 6: Verify typecheck**

Run: `pnpm --filter @gmacko/telemetry typecheck`
Expected: PASS.

**Step 7: Commit**

```bash
git add packages/telemetry/
git commit -m "feat(telemetry): scaffold @gmacko/telemetry package"
```

---

### Task 2: Add integration toggle to `@gmacko/config`

**Files:**
- Modify: `packages/config/src/integrations.ts`

**Step 1: Add `telemetry` to the integrations object**

In `packages/config/src/integrations.ts`, add after the `posthog: true` line:

```ts
  // Telemetry (default ON)
  telemetry: true,
```

And add the helper function at the bottom:

```ts
export const isTelemetryEnabled = () => integrations.telemetry;
```

**Step 2: Run typecheck**

Run: `pnpm --filter @gmacko/config typecheck`
Expected: PASS.

**Step 3: Commit**

```bash
git add packages/config/src/integrations.ts
git commit -m "feat(config): add telemetry integration toggle"
```

---

### Task 3: Implement `initTelemetry()` with resilience

**Files:**
- Create: `packages/telemetry/src/init.ts`
- Create: `packages/telemetry/src/testing.ts`
- Create: `packages/telemetry/src/__tests__/init.test.ts`
- Modify: `packages/telemetry/src/index.ts`

**Step 1: Write the failing test**

Create `packages/telemetry/src/__tests__/init.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";

describe("initTelemetry", () => {
  beforeEach(() => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318");
    vi.stubEnv("OTEL_SERVICE_NAME", "test-service");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exports initTelemetry function", async () => {
    const { initTelemetry } = await import("../init.js");
    expect(initTelemetry).toBeTypeOf("function");
  });

  it("does not throw when endpoint is invalid", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "not-a-url");
    const { initTelemetry } = await import("../init.js");
    expect(() => initTelemetry()).not.toThrow();
  });

  it("is a no-op when OTEL_ENABLED is false", async () => {
    vi.stubEnv("OTEL_ENABLED", "false");
    const { initTelemetry } = await import("../init.js");
    expect(() => initTelemetry()).not.toThrow();
  });

  it("is a no-op when integrations.telemetry is false", async () => {
    vi.mock("@gmacko/config", () => ({
      integrations: { telemetry: false },
    }));
    const { initTelemetry } = await import("../init.js");
    expect(() => initTelemetry()).not.toThrow();
    vi.restoreAllMocks();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @gmacko/telemetry test`
Expected: FAIL — module not found.

**Step 3: Create test utilities**

Create `packages/telemetry/src/testing.ts`:

```ts
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";

export function createTestProvider() {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();
  return { provider, exporter };
}

export { InMemorySpanExporter };
```

**Step 4: Implement `initTelemetry()`**

Create `packages/telemetry/src/init.ts`:

```ts
import { integrations } from "@gmacko/config";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

let initialized = false;

export function initTelemetry(): void {
  if (initialized) return;
  if (!integrations.telemetry) return;
  if (process.env.OTEL_ENABLED === "false") return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  initialized = true;

  try {
    const serviceName =
      process.env.OTEL_SERVICE_NAME ||
      process.env.SERVICE_NAME ||
      "gmacko-app";

    const resource = new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV ?? "development",
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "0.0.0",
    });

    const traceExporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });
    const metricExporter = new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` });

    const sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 60_000,
      }),
      instrumentations: [
        new HttpInstrumentation(),
        new FetchInstrumentation(),
      ],
    });

    sdk.start();

    const hostMetrics = new HostMetrics();
    hostMetrics.start();

    const shutdown = () => {
      sdk.shutdown().catch(() => {});
      hostMetrics.shutdown().catch(() => {});
    };

    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  } catch (error) {
    console.error("[telemetry] Failed to initialize OTel SDK:", error);
  }
}
```

**Step 5: Update `packages/telemetry/src/index.ts`**

```ts
export { initTelemetry } from "./init.js";
export { trace, metrics, SpanStatusCode, type Attributes } from "@opentelemetry/api";
```

Re-exports `@opentelemetry/api` so downstream packages don't need a direct dependency.

**Step 6: Run tests**

Run: `pnpm --filter @gmacko/telemetry test`
Expected: PASS.

**Step 7: Commit**

```bash
git add packages/telemetry/src/
git commit -m "feat(telemetry): implement initTelemetry with try/catch resilience"
```

---

### Task 4: Implement `withSpan()` helper

**Files:**
- Create: `packages/telemetry/src/span.ts`
- Create: `packages/telemetry/src/__tests__/span.test.ts`
- Modify: `packages/telemetry/src/index.ts`

**Step 1: Write the failing test**

Create `packages/telemetry/src/__tests__/span.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

describe("withSpan", () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeAll(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  it("creates a span with the given name", async () => {
    const { withSpan } = await import("../span.js");
    await withSpan("test-span", async () => "result");
    const spans = exporter.getFinishedSpans();
    expect(spans.some((s) => s.name === "test-span")).toBe(true);
  });

  it("returns the callback result", async () => {
    const { withSpan } = await import("../span.js");
    const result = await withSpan("return-span", async () => 42);
    expect(result).toBe(42);
  });

  it("records exception on error and re-throws", async () => {
    const { withSpan } = await import("../span.js");
    exporter.reset();
    await expect(
      withSpan("error-span", async () => { throw new Error("boom"); }),
    ).rejects.toThrow("boom");
    const spans = exporter.getFinishedSpans();
    const errorSpan = spans.find((s) => s.name === "error-span");
    expect(errorSpan?.status.code).toBe(2); // SpanStatusCode.ERROR
  });

  it("sets custom attributes", async () => {
    const { withSpan } = await import("../span.js");
    exporter.reset();
    await withSpan("attr-span", async () => "ok", { "custom.key": "value" });
    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === "attr-span");
    expect(span?.attributes["custom.key"]).toBe("value");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @gmacko/telemetry test`
Expected: FAIL — `../span.js` not found.

**Step 3: Implement `withSpan()`**

Create `packages/telemetry/src/span.ts`:

```ts
import { trace, SpanStatusCode, type Attributes } from "@opentelemetry/api";

const tracer = trace.getTracer("@gmacko/telemetry");

export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Attributes,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    } finally {
      span.end();
    }
  });
}
```

**Step 4: Update `packages/telemetry/src/index.ts`**

```ts
export { initTelemetry } from "./init.js";
export { withSpan } from "./span.js";
export { trace, metrics, SpanStatusCode, type Attributes } from "@opentelemetry/api";
```

**Step 5: Run tests**

Run: `pnpm --filter @gmacko/telemetry test`
Expected: PASS (span tests create their own provider).

**Step 6: Commit**

```bash
git add packages/telemetry/src/
git commit -m "feat(telemetry): add withSpan helper with real span assertions"
```

---

### Task 5: Implement `getMetrics()` instruments

**Files:**
- Create: `packages/telemetry/src/metrics.ts`
- Create: `packages/telemetry/src/__tests__/metrics.test.ts`
- Modify: `packages/telemetry/src/index.ts`

**Step 1: Write the failing test**

Create `packages/telemetry/src/__tests__/metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("getMetrics", () => {
  it("exports getMetrics function", async () => {
    const { getMetrics } = await import("../metrics.js");
    expect(getMetrics).toBeTypeOf("function");
  });

  it("returns an object with expected instruments", async () => {
    const { getMetrics } = await import("../metrics.js");
    const m = getMetrics();
    expect(m).toHaveProperty("trpcDuration");
    expect(m).toHaveProperty("trpcErrors");
    expect(m).toHaveProperty("authSessionValidations");
    expect(m).toHaveProperty("authOauthExchanges");
    expect(m).toHaveProperty("healthStatus");
  });

  it("returns the same instance on repeated calls", async () => {
    const { getMetrics } = await import("../metrics.js");
    expect(getMetrics()).toBe(getMetrics());
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @gmacko/telemetry test`
Expected: FAIL.

**Step 3: Implement `getMetrics()`**

Create `packages/telemetry/src/metrics.ts`:

```ts
import { metrics } from "@opentelemetry/api";

interface AppMetrics {
  trpcDuration: ReturnType<ReturnType<typeof metrics.getMeter>["createHistogram"]>;
  trpcErrors: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
  authSessionValidations: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
  authOauthExchanges: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
  healthStatus: ReturnType<ReturnType<typeof metrics.getMeter>["createGauge"]>;
}

let instance: AppMetrics | null = null;

export function getMetrics(): AppMetrics {
  if (instance) return instance;

  const meter = metrics.getMeter("@gmacko/telemetry");

  instance = {
    trpcDuration: meter.createHistogram("trpc.procedure.duration", {
      description: "Duration of tRPC procedure execution",
      unit: "ms",
    }),
    trpcErrors: meter.createCounter("trpc.procedure.errors", {
      description: "Count of tRPC procedure errors",
    }),
    authSessionValidations: meter.createCounter("auth.session.validations", {
      description: "Count of session validation attempts",
    }),
    authOauthExchanges: meter.createCounter("auth.oauth.exchanges", {
      description: "Count of OAuth token exchanges",
    }),
    healthStatus: meter.createGauge("app.health.status", {
      description: "Application health status (1=healthy, 0=degraded)",
    }),
  };

  return instance;
}
```

**Step 4: Update `packages/telemetry/src/index.ts`**

```ts
export { initTelemetry } from "./init.js";
export { withSpan } from "./span.js";
export { getMetrics } from "./metrics.js";
export { trace, metrics, SpanStatusCode, type Attributes } from "@opentelemetry/api";
```

**Step 5: Run tests**

Run: `pnpm --filter @gmacko/telemetry test`
Expected: PASS.

**Step 6: Commit**

```bash
git add packages/telemetry/src/
git commit -m "feat(telemetry): add getMetrics with tRPC, auth, and health instruments"
```

---

### Task 6: Add trace context mixin to `@gmacko/logging`

**Files:**
- Create: `packages/logging/src/otel.ts`
- Create: `packages/logging/vitest.config.ts`
- Create: `packages/logging/src/__tests__/otel.test.ts`
- Modify: `packages/logging/src/index.ts:91-134`
- Modify: `packages/logging/package.json`

**Step 1: Write the failing test**

Create `packages/logging/src/__tests__/otel.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("getOtelMixin", () => {
  it("exports getOtelMixin function", async () => {
    const { getOtelMixin } = await import("../otel.js");
    expect(getOtelMixin).toBeTypeOf("function");
  });

  it("returns empty object when no active span", async () => {
    const { getOtelMixin } = await import("../otel.js");
    const mixin = getOtelMixin();
    expect(mixin).toEqual({});
  });
});
```

**Step 2: Implement the mixin (lazy, no top-level await)**

Create `packages/logging/src/otel.ts`:

```ts
let traceApi: typeof import("@opentelemetry/api") | null = null;
let loadAttempted = false;

function loadTraceApi() {
  if (loadAttempted) return;
  loadAttempted = true;
  try {
    traceApi = require("@opentelemetry/api");
  } catch {
    // Not installed — mixin is a no-op
  }
}

export function getOtelMixin(): Record<string, string> {
  loadTraceApi();
  if (!traceApi) return {};

  const span = traceApi.trace.getActiveSpan();
  if (!span) return {};

  const ctx = span.spanContext();
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
  };
}
```

Note: Uses synchronous `require()` with lazy loading (not top-level await) to avoid CJS/ESM issues. The function is called as a Pino mixin on every log line, so it must be sync.

**Step 3: Wire the mixin into `createBaseLogger`**

In `packages/logging/src/index.ts`, add import at top:

```ts
import { getOtelMixin } from "./otel.js";
```

Inside `createBaseLogger()` pino options, add after `timestamp`:

```ts
    mixin: getOtelMixin,
```

**Step 4: Update `packages/logging/package.json`**

Add to `peerDependencies`:
```json
"@opentelemetry/api": ">=1.0.0"
```

Add to `peerDependenciesMeta`:
```json
"@opentelemetry/api": { "optional": true }
```

Add to `scripts`:
```json
"test": "vitest run --passWithNoTests",
"test:watch": "vitest"
```

Add to `devDependencies`:
```json
"@gmacko/vitest-config": "workspace:*",
"vitest": "^4.1.0"
```

**Step 5: Create `packages/logging/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
```

**Step 6: Run `pnpm install` and tests**

Run: `pnpm install && pnpm --filter @gmacko/logging test`
Expected: PASS.

**Step 7: Commit**

```bash
git add packages/logging/
git commit -m "feat(logging): add OTel trace context mixin (lazy, no top-level await)"
```

---

### Task 7: Decommission Sentry perf helpers from `@gmacko/logging`

**Files:**
- Modify: `packages/logging/src/index.ts:670-754` (delete `startTransaction` and `withPerformanceTracking`)

**Step 1: Verify no consumers**

Run: `grep -r "startTransaction\|withPerformanceTracking" packages/ apps/ --include="*.ts" --include="*.tsx" -l`
Expected: only `packages/logging/src/index.ts` itself.

**Step 2: Remove the dead code**

Delete from `packages/logging/src/index.ts`:
- The `startTransaction` function (lines 677-732)
- The `withPerformanceTracking` function (lines 737-754)
- The `SentrySpan` interface (lines 49-53) if no longer used

Keep the `SentryLike` interface and `getSentry()` function — they're still used by `logError`, `logWarning`, etc.

**Step 3: Run typecheck**

Run: `pnpm --filter @gmacko/logging typecheck`
Expected: PASS.

**Step 4: Commit**

```bash
git add packages/logging/src/index.ts
git commit -m "refactor(logging): remove unused Sentry perf helpers (replaced by @gmacko/telemetry)"
```

---

### Task 8: Replace tRPC timing middleware with OTel spans

**Files:**
- Modify: `packages/api/src/trpc.ts:1-7,163-178`
- Modify: `packages/api/package.json`

**Step 1: Add `@gmacko/telemetry` dependency**

In `packages/api/package.json`, add to `dependencies`:

```json
"@gmacko/telemetry": "workspace:*"
```

Run: `pnpm install`

**Step 2: Replace the timing middleware**

In `packages/api/src/trpc.ts`, add import at top:

```ts
import { trace, SpanStatusCode } from "@gmacko/telemetry";
import { getMetrics } from "@gmacko/telemetry";
```

Replace the `timingMiddleware` (lines 163-178) with:

```ts
const tracer = trace.getTracer("@gmacko/api");

const timingMiddleware = t.middleware(async ({ next, path, type }) => {
  if (t._config.isDev) {
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  return tracer.startActiveSpan(
    `trpc.${path}`,
    {
      attributes: {
        "rpc.system": "trpc",
        "rpc.method": path,
        "rpc.type": type,
      },
    },
    async (span) => {
      const start = performance.now();
      try {
        const result = await next();
        const durationMs = performance.now() - start;
        span.setStatus({ code: SpanStatusCode.OK });
        getMetrics().trpcDuration.record(durationMs, { "rpc.method": path });
        return result;
      } catch (error) {
        const durationMs = performance.now() - start;
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(
          error instanceof Error ? error : new Error(String(error)),
        );
        getMetrics().trpcDuration.record(durationMs, { "rpc.method": path });
        getMetrics().trpcErrors.add(1, {
          "rpc.method": path,
          "error.type": error instanceof Error ? error.name : "Unknown",
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
});
```

Note: duration is recorded for BOTH success and failure (fixes the timing regression Codex identified).

**Step 3: Remove old import**

Remove `import { createHash } from "crypto"` if it was only used for... wait, that's for API keys, keep it.

**Step 4: Run typecheck**

Run: `pnpm --filter @gmacko/api typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/api/
git commit -m "feat(api): replace tRPC console.log timing with OTel spans and metrics"
```

---

### Task 9: Wire telemetry into Next.js instrumentation

**Files:**
- Modify: `apps/nextjs/src/instrumentation.ts`
- Modify: `apps/nextjs/package.json`
- Modify: `apps/nextjs/next.config.js`

**Step 1: Add dependency and transpilePackage**

In `apps/nextjs/package.json`, add to `dependencies`:
```json
"@gmacko/telemetry": "workspace:*"
```

In `apps/nextjs/next.config.js`, add `"@gmacko/telemetry"` to `transpilePackages`.

Run: `pnpm install`

**Step 2: Update `instrumentation.ts`**

Replace `apps/nextjs/src/instrumentation.ts`:

```ts
import { integrations } from "@gmacko/config";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initTelemetry } = await import("@gmacko/telemetry");
    initTelemetry();
  }

  if (integrations.sentry) {
    if (process.env.NEXT_RUNTIME === "nodejs") {
      await import("../sentry.server.config");
    }

    if (process.env.NEXT_RUNTIME === "edge") {
      await import("../sentry.edge.config");
    }
  }
}
```

**Step 3: Run typecheck**

Run: `pnpm --filter @gmacko/nextjs typecheck`
Expected: PASS.

**Step 4: Commit**

```bash
git add apps/nextjs/
git commit -m "feat(nextjs): wire initTelemetry into instrumentation.ts"
```

---

### Task 10: Add OTel env vars to Turbo

**Files:**
- Modify: `turbo.json`

**Step 1: Add to `globalPassThroughEnv`**

Add these entries:
```json
"OTEL_EXPORTER_OTLP_ENDPOINT",
"OTEL_SERVICE_NAME",
"OTEL_ENABLED"
```

**Step 2: Commit**

```bash
git add turbo.json
git commit -m "chore: add OTEL env vars to turbo globalPassThroughEnv"
```

---

### Task 11: Add `no-console` lint rule

**Files:**
- Create or modify: `.oxlintrc.json`

**Step 1: Check and create config**

If `.oxlintrc.json` doesn't exist, create it:

```json
{
  "rules": {
    "no-console": "warn"
  }
}
```

If it exists, add `"no-console": "warn"` to its rules.

**Step 2: Verify**

Run: `pnpm lint:ox 2>&1 | grep "no-console" | head -5`
Expected: warnings for console.log usage.

**Step 3: Commit**

```bash
git add .oxlintrc.json
git commit -m "chore: add no-console warn lint rule"
```

---

### Task 12: Final integration verification

**Step 1: Full typecheck**

Run: `pnpm turbo run typecheck`
Expected: PASS.

**Step 2: All tests**

Run: `pnpm turbo run test`
Expected: PASS.

**Step 3: Build**

Run: `pnpm turbo run build --filter=@gmacko/nextjs`
Expected: PASS.

**Step 4: Fix any issues and commit**

---

## Deferred to separate PR(s)

| Item | Reason |
|---|---|
| `docker-compose.otel.yml` + collector config | Premature without production deployment |
| `docker-compose.grafana.yml` (Tempo/Prometheus/Loki) | Self-hosted ops burden, validate need first |
| Auth flow spans in `@gmacko/auth` | Phase 2 manual instrumentation |
| Drizzle DB query spans | Phase 2 — needs custom logger integration, not auto-instrumentation |
| Pre-built Grafana dashboards | Phase 2 — needs backend first |
| Scaffold integration toggle (create-gmacko-app CLI) | Separate concern — scaffold vs runtime |
| Remaining console.log migration | Organic over time with lint rule enforcement |

## Summary of changes

| Package | Change |
|---|---|
| `@gmacko/telemetry` (new) | `initTelemetry()`, `withSpan()`, `getMetrics()`, re-exports `@opentelemetry/api` |
| `@gmacko/logging` | Trace context mixin, decommission Sentry perf helpers |
| `@gmacko/config` | Add `telemetry: true` integration toggle |
| `@gmacko/api` | tRPC timing middleware → OTel spans + metrics |
| `@gmacko/nextjs` | `instrumentation.ts` calls `initTelemetry()` |
| `turbo.json` | OTel env vars in `globalPassThroughEnv` |
| Root | `no-console: warn` lint rule |

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|---------------|-----------|-----------|----------|
| 1 | CEO | Mode: SELECTIVE EXPANSION | Mechanical | P6 | Feature enhancement on existing system | — |
| 2 | CEO | Approach A (full OTel SDK) | Mechanical | P1 | Highest completeness, OTLP gateway is clean | B, C |
| 3 | CEO | Add telemetry integration toggle | Mechanical | P4 | Follows existing pattern, DRY | — |
| 4 | CEO | Defer Docker/Grafana infra | Taste→User | P3 | Ops burden premature — user confirmed | Proceed as-is |
| 5 | CEO | Decommission Sentry perf helpers | Mechanical | P5 | Remove overlap, explicit over clever | — |
| 6 | Eng | Remove instrumentation-pg | Mechanical | P5 | Repo uses postgres-js, not pg. Would do nothing. | — |
| 7 | Eng | Add try/catch to initTelemetry | Mechanical | P1 | Can't crash app on boot | — |
| 8 | Eng | Lazy require in otel.ts (not TLA) | Mechanical | P5 | Avoids CJS/ESM compatibility issues | Top-level await |
| 9 | Eng | Record duration on failure too | Mechanical | P1 | Completeness — failed latency matters | — |
| 10 | Eng | Re-export @opentelemetry/api from telemetry | Mechanical | P4 | Single dependency boundary | Direct import |
| 11 | Eng | process.once for signal handlers | Mechanical | P5 | Prevents duplicate handlers on HMR | — |
| 12 | Eng | Defer Drizzle DB instrumentation | Taste | P3 | Needs custom logger integration, not auto | — |
| 13 | DX | Defer scaffold CLI integration | Taste | P3 | Runtime plumbing first, scaffold second | — |
