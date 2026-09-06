/**
 * `Sessions`: "who am I" for either credential kind. Sign-in itself is
 * better-auth's (`/api/auth/*`, mounted by the app).
 */
import { ApiKeys } from "@gmacko/auth/api-keys";
import type { RequestContextShape } from "@gmacko/auth/request-context";
import type { DatabaseError } from "@gmacko/db";
import { SessionState } from "@gmacko/domain/auth";
import { Context, Effect, Layer } from "effect";

const anonymous = new SessionState({ user: null, credential: null });

export interface SessionsShape {
  /**
   * The state for a request: a `gmk_` bearer resolves to its owner with
   * `credential: "key"`, a session cookie to the session's user (the `user`
   * row, so `role` is fresh) with `credential: "session"`, anything else to
   * `user: null`. The endpoint is public, so an invalid key is anonymous
   * here, not 401: the client learns "not signed in" from one request.
   */
  readonly state: (
    bearer: string | undefined,
    context: RequestContextShape,
  ) => Effect.Effect<SessionState, DatabaseError>;
}

export class Sessions extends Context.Service<Sessions, SessionsShape>()(
  "@gmacko/api/Sessions",
) {
  static layer: Layer.Layer<Sessions, never, ApiKeys> = Layer.effect(Sessions)(
    Effect.map(ApiKeys, (keys) =>
      Sessions.of({
        state: (bearer, context) =>
          Effect.gen(function* () {
            if (bearer !== undefined) {
              const key = yield* keys
                .authenticate(bearer)
                .pipe(
                  Effect.catchTag("Unauthorized", () => Effect.succeed(null)),
                );
              return key === null
                ? anonymous
                : new SessionState({ user: key.user, credential: "key" });
            }
            const session = yield* context.session;
            if (session === null) return anonymous;
            const user = yield* context.user(session.user.id);
            return user === null
              ? anonymous
              : new SessionState({ user, credential: "session" });
          }),
      }),
    ),
  );
}
