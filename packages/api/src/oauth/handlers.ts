import { AppApi } from "@gmacko/domain";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { requestContext, withUser } from "../boundary";
import { OAuthConnections } from "./connections";
import { OAuthWorkspaces } from "./service";

/**
 * The browser session the request came with. These endpoints are `Session`
 * only, so the credential middleware has already read and validated it; a
 * missing one here is a defect, not a 401.
 */
const sessionId = Effect.flatMap(
  requestContext,
  (request) => request.session,
).pipe(
  Effect.flatMap((session) =>
    session === null
      ? Effect.die(new Error("Session endpoint reached without a session"))
      : Effect.succeed(session.session.id),
  ),
);

export const OAuthHandlers = HttpApiBuilder.group(AppApi, "oauth", (handlers) =>
  Effect.gen(function* () {
    const workspaces = yield* OAuthWorkspaces;
    const connections = yield* OAuthConnections;
    return handlers
      .handle("workspaces", () =>
        withUser((user) =>
          Effect.flatMap(sessionId, (id) => workspaces.choice(user.id, id)),
        ),
      )
      .handle("selectWorkspace", ({ payload }) =>
        withUser((user) =>
          Effect.flatMap(sessionId, (id) =>
            workspaces.select(user.id, id, payload.workspaceId),
          ),
        ),
      )
      .handle("listConnections", () =>
        withUser((user) => connections.list(user.id)),
      )
      .handle("revokeConnection", ({ params }) =>
        withUser((user) => connections.revoke(user.id, params.id)),
      );
  }),
).pipe(
  Layer.provide(Layer.mergeAll(OAuthWorkspaces.layer, OAuthConnections.layer)),
);
