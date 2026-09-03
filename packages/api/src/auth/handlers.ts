import { bearerOf } from "@gmacko/auth/middleware";
import { AppApi } from "@gmacko/domain";
import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { internal, requestContext } from "../boundary";
import { Sessions } from "./service";

export const AuthHandlers = HttpApiBuilder.group(AppApi, "auth", (handlers) =>
  Effect.map(Sessions, (sessions) =>
    handlers
      .handle("session", () =>
        internal(
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest;
            const context = yield* requestContext;
            return yield* sessions.state(bearerOf(request), context);
          }),
        ),
      )
      .handle("secret", () =>
        Effect.succeed("you can see this secret message!"),
      ),
  ),
).pipe(Layer.provide(Sessions.layer));
