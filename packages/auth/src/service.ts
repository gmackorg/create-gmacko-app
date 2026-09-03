/**
 * The `Auth` service: one better-auth instance per runtime, built from the
 * `Database` service's promise-drizzle handle, exposed to handlers as Effects.
 */
import { Database } from "@gmacko/db";
import { Context, Effect, Layer } from "effect";
import type { Session, User } from "./index";
import { type Auth as AuthInstance, type AuthOptions, makeAuth } from "./index";

/**
 * The authenticated user for the current request is declared by the
 * contract (`@gmacko/domain/security`); re-exported here because this
 * package implements the middlewares that provide it (`./middleware`).
 */
export { CurrentUser, type CurrentUserShape } from "@gmacko/domain/security";
export type { Session, User } from "./index";

export interface AuthShape {
  /** The raw better-auth instance (for `api.*` calls that need it). */
  readonly instance: AuthInstance;
  /** Serves `/api/auth/*`. better-auth turns its own failures into responses. */
  readonly handler: (request: Request) => Effect.Effect<Response>;
  /**
   * The session (record + user) for these request headers, or `null` when
   * anonymous. Served from the signed cookie cache when the browser sent
   * it, as-is: `RequestContext.session` is the validated form (it refuses a
   * cached session whose user row is gone), and anything that gates on
   * `user.role` must read the row (`RequestContext.role`).
   */
  readonly session: (headers: Headers) => Effect.Effect<Session | null>;
  /** `session(headers).user`, or `null`. */
  readonly currentUser: (headers: Headers) => Effect.Effect<User | null>;
  /**
   * better-auth's sign-out for these headers: revokes the session row the
   * cookie names (a no-op when it is already gone) and returns the
   * `Set-Cookie` values that expire every auth cookie — `session_token`,
   * `session_data` and their `__Secure-` forms over https — for the caller
   * to put on its own response.
   */
  readonly signOut: (headers: Headers) => Effect.Effect<ReadonlyArray<string>>;
}

export class Auth extends Context.Service<Auth, AuthShape>()(
  "@gmacko/auth/Auth",
) {
  static make = (instance: AuthInstance): AuthShape => {
    const session = (headers: Headers) =>
      Effect.promise(() => instance.api.getSession({ headers }));
    return {
      instance,
      handler: (request) => Effect.promise(() => instance.handler(request)),
      session,
      currentUser: (headers) =>
        Effect.map(session(headers), (found) => found?.user ?? null),
      signOut: (headers) =>
        Effect.map(
          Effect.promise(() =>
            instance.api.signOut({ headers, returnHeaders: true }),
          ),
          (result) => result.headers.getSetCookie(),
        ),
    };
  };

  /** Builds the instance over `Database.plain`; the app supplies the options. */
  static layer = (options: AuthOptions): Layer.Layer<Auth, never, Database> =>
    Layer.effect(Auth)(
      Effect.map(Database, ({ plain }) => Auth.make(makeAuth(options, plain))),
    );
}
