/**
 * Test helpers for suites that exercise the auth middlewares over the
 * sqlite-node `layerTest`: a statement-counting `Database`, better-auth
 * options with an in-memory magic-link sink, and a sign-in helper that
 * returns the cookies a browser would send. Node only (imports
 * `@gmacko/db/testing`); never part of the Worker bundle.
 */
import { Database } from "@gmacko/db";
import { Effect, Layer } from "effect";

import type { AuthOptions, MagicLink } from "./index";
import type { AuthShape } from "./service";

/** Which drizzle handle prepared a statement: the services' (`db`) or better-auth's (`plain`). */
export type Handle = "db" | "plain";

export interface Statement {
  readonly handle: Handle;
  readonly sql: string;
}

/** Every statement drizzle prepared, on either handle, in order. */
export interface StatementLog {
  readonly statements: Array<Statement>;
  /** Statements on `handle` mentioning `table` (double-quoted, as drizzle emits it). */
  readonly touching: (handle: Handle, table: string) => number;
  readonly reset: () => void;
}

export const makeStatementLog = (): StatementLog => {
  const statements: Array<Statement> = [];
  return {
    statements,
    touching: (handle, table) =>
      statements.filter(
        (statement) =>
          statement.handle === handle && statement.sql.includes(`"${table}"`),
      ).length,
    reset: () => {
      statements.length = 0;
    },
  };
};

interface PreparedQueryLike {
  readonly sql: string;
}
/**
 * The prepared statement drizzle builds. Opaque on purpose: this patch reads
 * the query it was built from and hands the statement back untouched, so the
 * only contract it needs is "the object drizzle's own builders execute".
 */
type PreparedStatementLike = object;
interface SessionLike {
  prepareQuery: (
    query: PreparedQueryLike,
    ...rest: ReadonlyArray<unknown>
  ) => PreparedStatementLike;
}
interface DrizzleLike {
  readonly _: { readonly session: SessionLike };
}

/**
 * Records every statement both drizzle handles prepare: `db` (the Effect
 * flavour the services use) and `plain` (better-auth's adapter). Both route
 * every builder through `session.prepareQuery`, whose first argument carries
 * the SQL text, so one patch per handle sees everything.
 */
export const countingDatabase = (
  log: StatementLog,
): Layer.Layer<Database, never, Database> =>
  Layer.effect(Database)(
    Effect.map(Database, (database) => {
      const handles: ReadonlyArray<readonly [Handle, unknown]> = [
        ["db", database.db],
        ["plain", database.plain],
      ];
      for (const [handle, drizzle] of handles) {
        // SAFETY: both entries of `handles` are drizzle database instances
        // (`Database.db` and `Database.plain`), and every drizzle instance
        // keeps its session at `_.session` and routes every builder through
        // `session.prepareQuery(query, …)` with the SQL text on the first
        // argument — the same internal contract `@gmacko/db`'s own `rewire`
        // (packages/db/src/database.ts) patches to map driver errors.
        const session = (drizzle as DrizzleLike)._.session;
        const prepareQuery = session.prepareQuery;
        session.prepareQuery = function (this: SessionLike, query, ...rest) {
          log.statements.push({ handle, sql: query.sql });
          return prepareQuery.call(this, query, ...rest);
        };
      }
      // The same instance, patched in place: the runtime and the handler
      // share it through the memo map, so both handles are the counted ones.
      return database;
    }),
  );

/** Options every auth test uses; `links` receives each magic link sent. */
export const testAuthOptions = (
  baseUrl: string,
  links: Array<MagicLink>,
): AuthOptions => ({
  baseUrl,
  productionUrl: baseUrl,
  secret: "test-secret-that-is-long-enough-for-better-auth",
  allowedOrigins: [baseUrl],
  github: { clientId: "gh-client", clientSecret: "gh-secret" },
  google: { clientId: "google-client", clientSecret: "google-secret" },
  magicLink: {
    send: async (link) => {
      links.push(link);
    },
  },
});

export interface SignedIn {
  readonly email: string;
  /** `better-auth.session_token=...` */
  readonly sessionCookie: string;
  /** `better-auth.session_data=...`: the signed cookie cache, when set. */
  readonly cacheCookie: string | undefined;
  /** Both cookies, as a browser would send them. */
  readonly cookie: string;
}

const cookiePair = (response: Response, name: string): string | undefined =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0] ?? "")
    .find((pair) => pair.startsWith(`${name}=`));

/** Runs the magic-link round trip in-process and returns the session cookies. */
export const signInWithMagicLink = (
  auth: AuthShape,
  baseUrl: string,
  links: Array<MagicLink>,
  email: string,
): Effect.Effect<SignedIn> =>
  Effect.gen(function* () {
    yield* auth.handler(
      new Request(`${baseUrl}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl },
        body: JSON.stringify({ email, callbackURL: "/" }),
      }),
    );
    const link = links.find((l) => l.email === email);
    if (!link) throw new Error(`magic link was not sent to ${email}`);
    const verified = yield* auth.handler(
      new Request(link.url, { redirect: "manual" }),
    );
    const sessionCookie = cookiePair(verified, "better-auth.session_token");
    if (!sessionCookie) {
      throw new Error(
        `no session cookie in: ${verified.headers.getSetCookie().join(" | ")}`,
      );
    }
    const cacheCookie = cookiePair(verified, "better-auth.session_data");
    return {
      email,
      sessionCookie,
      cacheCookie,
      cookie: [sessionCookie, cacheCookie].filter(Boolean).join("; "),
    };
  });
