import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

import {
  ForgeHealth,
  ForgeUnhealthy,
  HealthStatus,
  LiveStatus,
  ReadyStatus,
  Unhealthy,
  UnhealthyReport,
} from "./models";

/**
 * All public. This group declares absolute paths and is added to `AppApi`
 * *after* `.prefix("/api")`: `HttpApi.prefix` rewrites only the groups
 * present when it is called (HttpApi.js `prefix` maps `this.groups`), which
 * is how the ForgeGraph probe lives at `/.well-known/forge-health` while
 * the rest of the API sits under `/api`. `HttpApiGroup.make(id, { topLevel })`
 * is unrelated: it only flattens the generated client's method nesting.
 */
export class HealthApi extends HttpApiGroup.make("health")
  .add(
    HttpApiEndpoint.get("live", "/api/health/live", {
      success: LiveStatus,
    }),
  )
  .add(
    HttpApiEndpoint.get("ready", "/api/health/ready", {
      success: ReadyStatus,
      error: Unhealthy,
    }),
  )
  .add(
    HttpApiEndpoint.get("full", "/api/health", {
      success: HealthStatus,
      error: UnhealthyReport,
    }),
  )
  .add(
    HttpApiEndpoint.get("forge", "/.well-known/forge-health", {
      success: ForgeHealth,
      error: ForgeUnhealthy,
    }),
  ) {}
