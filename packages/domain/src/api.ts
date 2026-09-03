import { HttpApi } from "effect/unstable/httpapi";

import { AdminApi } from "./admin/api";
import { AuthApi } from "./auth/api";
import { HealthApi } from "./health/api";
import { PostsApi } from "./posts/api";
import { SettingsApi } from "./settings/api";

/**
 * The whole contract. Server handlers (`HttpApiBuilder.group(AppApi, ...)`),
 * the generated client, OpenAPI and docs/API_AUTH.md all derive from it.
 *
 * `HealthApi` is added after the prefix on purpose; see health/api.ts.
 */
export class AppApi extends HttpApi.make("gmacko")
  .add(AuthApi)
  .add(PostsApi)
  .add(SettingsApi)
  .add(AdminApi)
  .prefix("/api")
  .add(HealthApi) {}
