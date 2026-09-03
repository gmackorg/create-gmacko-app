/**
 * A tiny `HttpApi` that uses every domain middleware once, served through
 * `HttpRouter.toWebHandler` exactly the way apps/web serves `AppApi`. The
 * handlers echo `CurrentUser`, so a response body proves which credential
 * authenticated the call.
 */
import type { Database } from "@gmacko/db";
import {
  AdminOnly,
  CurrentUser,
  Session,
  SessionOrKey,
  WorkspaceRole,
} from "@gmacko/domain";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { Etag, HttpPlatform, HttpRouter } from "effect/unstable/http";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from "effect/unstable/httpapi";
import { SecurityLive } from "../middleware";
import type { AuthSecurityConfig } from "../security-config";
import type { Auth } from "../service";

export const Who = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  role: Schema.Literals(["user", "admin"]),
  credential: Schema.Literals(["session", "key"]),
});
export type Who = typeof Who.Type;

export class TestApi extends HttpApi.make("test").add(
  HttpApiGroup.make("t")
    .add(HttpApiEndpoint.get("public", "/public", { success: Schema.String }))
    .add(HttpApiEndpoint.get("me", "/me", { success: Who }).middleware(Session))
    .add(
      HttpApiEndpoint.post("sessionOnly", "/session-only", {
        success: Who,
      }).middleware(Session),
    )
    .add(
      HttpApiEndpoint.get("read", "/read", { success: Who }).middleware(
        SessionOrKey("read"),
      ),
    )
    .add(
      HttpApiEndpoint.post("write", "/write", { success: Who }).middleware(
        SessionOrKey("write"),
      ),
    )
    .add(
      HttpApiEndpoint.get("admin", "/admin", { success: Who })
        .middleware(AdminOnly)
        .middleware(SessionOrKey("admin")),
    )
    .add(
      HttpApiEndpoint.get("workspace", "/workspace", { success: Who })
        .middleware(WorkspaceRole("member"))
        .middleware(SessionOrKey("read")),
    )
    .add(
      HttpApiEndpoint.get("workspaceAdmin", "/workspace-admin", {
        success: Who,
      })
        .middleware(WorkspaceRole("admin"))
        .middleware(SessionOrKey("read")),
    )
    .add(
      HttpApiEndpoint.get("workspaceOwner", "/workspace-owner", {
        success: Who,
      })
        .middleware(WorkspaceRole("owner"))
        .middleware(SessionOrKey("read")),
    ),
) {}

const who = Effect.map(
  CurrentUser,
  (user): Who => ({
    id: user.id,
    email: user.email,
    role: user.role,
    credential: user.credential,
  }),
);

const Handlers = HttpApiBuilder.group(TestApi, "t", (handlers) =>
  handlers
    .handle("public", () => Effect.succeed("ok"))
    .handle("me", () => who)
    .handle("sessionOnly", () => who)
    .handle("read", () => who)
    .handle("write", () => who)
    .handle("admin", () => who)
    .handle("workspace", () => who)
    .handle("workspaceAdmin", () => who)
    .handle("workspaceOwner", () => who),
);

const PlatformLive = Layer.mergeAll(
  HttpPlatform.layer.pipe(Layer.provideMerge(FileSystem.layerNoop({}))),
  Path.layer,
  Etag.layer,
);

export const TestApiLive = HttpApiBuilder.layer(TestApi).pipe(
  Layer.provide(Handlers),
  Layer.provide(SecurityLive),
  Layer.provide(PlatformLive),
);

/** `{ handler, dispose }` over the given services, sharing the runtime's memo map. */
export const makeTestHandler = (
  services: Layer.Layer<Auth | Database | AuthSecurityConfig>,
  memoMap: Layer.MemoMap,
) =>
  HttpRouter.toWebHandler(TestApiLive.pipe(Layer.provideMerge(services)), {
    memoMap,
    disableLogger: true,
  });

export const jsonOf = (response: Response) =>
  response.json() as Promise<Record<string, unknown>>;
