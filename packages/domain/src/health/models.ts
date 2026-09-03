/**
 * Health probes. Shapes keep the pre-migration route contract (minus the
 * Node-only memory check and process uptime), so ForgeGraph and the
 * platform probes keep working unchanged. Failure bodies are tagged errors
 * with status 503; production handlers fill `message`/`error` with generic
 * text (AGENTS.md: health endpoints never leak internals).
 */
import { Schema } from "effect";

export const Stage = Schema.Literals([
  "development",
  "preview",
  "staging",
  "production",
]);
export type Stage = typeof Stage.Type;

/** `GET /api/health/live`: the isolate answers. */
export class LiveStatus extends Schema.Class<LiveStatus>("LiveStatus")({
  status: Schema.Literal("ok"),
  stage: Stage,
}) {}

/** `GET /api/health/ready`: the database answers too. */
export class ReadyStatus extends Schema.Class<ReadyStatus>("ReadyStatus")({
  status: Schema.Literal("ok"),
  latencyMs: Schema.Number,
}) {}

export class Unhealthy extends Schema.TaggedError<Unhealthy>()(
  "Unhealthy",
  {
    status: Schema.Literal("unhealthy"),
    detail: Schema.String,
  },
  { httpApiStatus: 503 },
) {}

export const CheckStatus = Schema.Literals(["pass", "fail", "warn"]);
export type CheckStatus = typeof CheckStatus.Type;

export const CheckResult = Schema.Struct({
  status: CheckStatus,
  message: Schema.optionalKey(Schema.String),
  responseTime: Schema.optionalKey(Schema.Number),
});
export type CheckResult = typeof CheckResult.Type;

const healthChecks = Schema.Struct({ database: CheckResult });

/** `GET /api/health`: 200 while healthy or degraded. */
export class HealthStatus extends Schema.Class<HealthStatus>("HealthStatus")({
  status: Schema.Literals(["healthy", "degraded"]),
  timestamp: Schema.Date,
  version: Schema.String,
  checks: healthChecks,
}) {}

/** `GET /api/health` at 503: the same report, with a failing check. */
export class UnhealthyReport extends Schema.TaggedError<UnhealthyReport>()(
  "UnhealthyReport",
  {
    status: Schema.Literal("unhealthy"),
    timestamp: Schema.Date,
    version: Schema.String,
    checks: healthChecks,
  },
  { httpApiStatus: 503 },
) {}

export const ForgeCheckStatus = Schema.Literals([
  "healthy",
  "degraded",
  "unhealthy",
]);
export type ForgeCheckStatus = typeof ForgeCheckStatus.Type;

export const ForgeCheck = Schema.Struct({
  status: ForgeCheckStatus,
  latencyMs: Schema.Number,
  checkedAt: Schema.Date,
  error: Schema.optionalKey(Schema.String),
});
export type ForgeCheck = typeof ForgeCheck.Type;

const forgeChecks = Schema.Record(Schema.String, ForgeCheck);

/** `GET /.well-known/forge-health`: ForgeGraph's 1.0 probe shape. */
export class ForgeHealth extends Schema.Class<ForgeHealth>("ForgeHealth")({
  status: Schema.Literals(["healthy", "degraded"]),
  version: Schema.Literal("1.0"),
  timestamp: Schema.Date,
  checks: forgeChecks,
}) {}

export class ForgeUnhealthy extends Schema.TaggedError<ForgeUnhealthy>()(
  "ForgeUnhealthy",
  {
    status: Schema.Literal("unhealthy"),
    version: Schema.Literal("1.0"),
    timestamp: Schema.Date,
    checks: forgeChecks,
  },
  { httpApiStatus: 503 },
) {}
