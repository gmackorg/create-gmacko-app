/**
 * The `Auth` service: one better-auth instance per runtime, built from the
 * `Database` service's promise-drizzle handle, exposed to handlers as Effects.
 */
import { Database } from "@gmacko/db";
import { Context, Effect, Layer } from "effect";
import type { User } from "./index";
import { type Auth as AuthInstance, type AuthOptions, makeAuth } from "./index";

/**
 * The authenticated user for the current request is declared by the
 * contract (`@gmacko/domain/security`); re-exported here because this
 * package implements the middlewares that provide it (Phase 3).
 */
export { CurrentUser, type CurrentUserShape } from "@gmacko/domain/security";
export type { User } from "./index";

export interface AuthShape {
  /** The raw better-auth instance (for `api.*` calls that need it). */
  readonly instance: AuthInstance;
  /** Serves `/api/auth/*`. better-auth turns its own failures into responses. */
  readonly handler: (request: Request) => Effect.Effect<Response>;
  /** The session's user for these request headers, or `null` when anonymous. */
  readonly currentUser: (headers: Headers) => Effect.Effect<User | null>;
}

export class Auth extends Context.Service<Auth, AuthShape>()(
  "@gmacko/auth/Auth",
) {
  static make = (instance: AuthInstance): AuthShape => ({
    instance,
    handler: (request) => Effect.promise(() => instance.handler(request)),
    currentUser: (headers) =>
      Effect.promise(() => instance.api.getSession({ headers })).pipe(
        Effect.map((session) => session?.user ?? null),
      ),
  });

  /** Builds the instance over `Database.plain`; the app supplies the options. */
  static layer = (options: AuthOptions): Layer.Layer<Auth, never, Database> =>
    Layer.effect(Auth)(
      Effect.map(Database, ({ plain }) => Auth.make(makeAuth(options, plain))),
    );
}
