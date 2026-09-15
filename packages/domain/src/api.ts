import { Sla } from "@forgegraph/contract/effect";
import { HttpApi, OpenApi } from "effect/unstable/httpapi";

import pkg from "../package.json" with { type: "json" };
import { AdminApi } from "./admin/api";
import { AuthApi } from "./auth/api";
import { HealthApi } from "./health/api";
import { EndpointBoundary } from "./middleware";
import { PostsApi } from "./posts/api";
import { SettingsApi } from "./settings/api";

/**
 * The whole contract. Server handlers (`HttpApiBuilder.group(AppApi, ...)`),
 * the generated client, OpenAPI and docs/API_AUTH.md all derive from it.
 *
 * `HealthApi` is added after the prefix on purpose; see health/api.ts. The
 * api-level `EndpointBoundary` (the span per endpoint and the `InternalError`
 * translation) goes before it for the same reason: `HttpApi.middleware`
 * reaches only the endpoints present when it is called, so the health probes
 * keep their own 503 shapes (see errors.ts). The OpenAPI `info` block is the
 * package name and version, so the document says which contract it describes.
 *
 * The ForgeGraph `Sla` here is the service-level default every operation
 * inherits leaf by leaf; a group or endpoint overrides single leaves with its
 * own `Sla` annotation. Visibility is `IsPublic` per endpoint (private by
 * default); authentication is derived from the security middleware.
 */
export class AppApi extends HttpApi.make("gmacko")
  .add(AuthApi)
  .add(PostsApi)
  .add(SettingsApi)
  .add(AdminApi)
  .prefix("/api")
  .middleware(EndpointBoundary)
  .add(HealthApi)
  .annotateMerge(OpenApi.annotations({ title: "gmacko", version: pkg.version }))
  .annotate(Sla, {
    availability: 0.999,
    latency: { p95Ms: 300, p99Ms: 800 },
    timeoutMs: 10_000,
  }) {}
