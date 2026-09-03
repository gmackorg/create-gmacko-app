import { HttpApi, OpenApi } from "effect/unstable/httpapi";

import pkg from "../package.json" with { type: "json" };
import { AdminApi } from "./admin/api";
import { AuthApi } from "./auth/api";
import { HealthApi } from "./health/api";
import { PostsApi } from "./posts/api";
import { SettingsApi } from "./settings/api";

/**
 * The whole contract. Server handlers (`HttpApiBuilder.group(AppApi, ...)`),
 * the generated client, OpenAPI and docs/API_AUTH.md all derive from it.
 *
 * `HealthApi` is added after the prefix on purpose; see health/api.ts. The
 * api-level `InternalError` middleware (Phase 4) goes before it for the same
 * reason; see errors.ts. The OpenAPI `info` block is the package name and
 * version, so the document says which contract it describes.
 */
export class AppApi extends HttpApi.make("gmacko")
  .add(AuthApi)
  .add(PostsApi)
  .add(SettingsApi)
  .add(AdminApi)
  .prefix("/api")
  .add(HealthApi)
  .annotateMerge(
    OpenApi.annotations({ title: "gmacko", version: pkg.version }),
  ) {}
