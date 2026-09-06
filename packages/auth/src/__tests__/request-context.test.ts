/**
 * `RequestContext`: built once per incoming request and shared by every API
 * dispatch that request makes. The seam is `HttpRouter.toWebHandler`'s
 * `handler(request, context)` argument: an SSR render builds the context
 * once and hands the same `Context` to every in-process dispatch, so six API
 * calls cost one session read, one user read (which validates the session
 * and answers the role) and one membership read.
 */
import { Database } from "@gmacko/db";
import { user, workspace, workspaceMembership } from "@gmacko/db/schema";
import { layerTest } from "@gmacko/db/testing";
import { eq } from "drizzle-orm";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MagicLink } from "../index";
import { RequestContext } from "../request-context";
import { AuthSecurityConfig } from "../security-config";
import { Auth } from "../service";
import {
  countingDatabase,
  makeStatementLog,
  type SignedIn,
  signInWithMagicLink,
  testAuthOptions,
} from "../testing";
import { makeTestHandler } from "./test-api";

const baseUrl = "http://localhost:3001";
const links: Array<MagicLink> = [];
const log = makeStatementLog();

const CountedDatabase = countingDatabase(log).pipe(Layer.provide(layerTest));
const Services = Layer.mergeAll(
  CountedDatabase,
  Auth.layer(testAuthOptions(baseUrl, links)).pipe(
    Layer.provide(CountedDatabase),
  ),
  Layer.succeed(AuthSecurityConfig)({
    allowedOrigins: [baseUrl],
    stage: "development",
  }),
);

/** The six calls one render makes: a mix of public, session, role and workspace checks. */
const renderCalls: ReadonlyArray<readonly [string, string]> = [
  ["GET", "/public"],
  ["GET", "/me"],
  ["GET", "/read"],
  ["GET", "/admin"],
  ["GET", "/workspace"],
  ["GET", "/read"],
];

describe("RequestContext", () => {
  let runtime: ManagedRuntime.ManagedRuntime<
    Auth | Database | AuthSecurityConfig,
    never
  >;
  let handler: (
    request: Request,
    context?: Context.Context<never>,
  ) => Promise<Response>;
  let dispose: () => Promise<void>;
  let signedIn: SignedIn;

  beforeAll(async () => {
    runtime = ManagedRuntime.make(Services);
    const api = makeTestHandler(Services, runtime.memoMap);
    handler = api.handler;
    dispose = api.dispose;
    signedIn = await runtime.runPromise(
      Effect.flatMap(Auth, (auth) =>
        signInWithMagicLink(
          auth,
          baseUrl,
          links,
          `render-${crypto.randomUUID()}@example.com`,
        ),
      ),
    );
    // An admin with a workspace, so /admin and /workspace both pass and
    // their reads are the ones being counted.
    await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(user)
            .set({ role: "admin" })
            .where(eq(user.email, signedIn.email))
            .returning({ id: user.id });
          const [ws] = yield* db
            .insert(workspace)
            .values({
              name: "Render",
              slug: `render-${crypto.randomUUID()}`,
              ownerUserId: row!.id,
            })
            .returning();
          yield* db
            .insert(workspaceMembership)
            .values({ workspaceId: ws!.id, userId: row!.id, role: "owner" });
        }),
      ),
    );
  });
  afterAll(async () => {
    await dispose();
    await runtime.dispose();
  });

  // better-auth reads through `plain` (session, then its own user lookup);
  // the user (session validation + role) and membership reads are ours, on
  // `db`.
  const counts = () => ({
    session: log.touching("plain", "session"),
    user: log.touching("db", "user"),
    membership: log.touching("db", "workspace_membership"),
  });

  it("performs 1 session, 1 user and 1 membership read for 6 calls sharing one context", async () => {
    // Only the session token: the cookie cache (session_data) would let
    // better-auth skip the read entirely and hide what is being measured.
    const headers = new Headers({ cookie: signedIn.sessionCookie });
    const shared = Context.make(
      RequestContext,
      await runtime.runPromise(RequestContext.make(headers)),
    );
    log.reset();

    const responses = await Promise.all(
      renderCalls.map(([method, path]) =>
        handler(
          new Request(`http://localhost${path}`, {
            method,
            headers: { cookie: signedIn.sessionCookie },
          }),
          shared,
        ),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([
      200, 200, 200, 200, 200, 200,
    ]);
    expect(counts()).toEqual({ session: 1, user: 1, membership: 1 });
  });

  it("without a shared context every request builds its own (the direct-API case)", async () => {
    log.reset();
    for (const [method, path] of renderCalls) {
      const response = await handler(
        new Request(`http://localhost${path}`, {
          method,
          headers: { cookie: signedIn.sessionCookie },
        }),
      );
      expect(response.status).toBe(200);
    }
    // Five authenticated calls, one session read and one user read (the
    // validation, which /admin's role check shares) each; /workspace reads
    // the membership once.
    expect(counts()).toEqual({ session: 5, user: 5, membership: 1 });
  });

  it("memoises inside one context: repeated reads of the same user cost one query", async () => {
    log.reset();
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const context = yield* RequestContext.make(
          new Headers({ cookie: signedIn.sessionCookie }),
        );
        const [a, b] = yield* Effect.all([context.session, context.session], {
          concurrency: "unbounded",
        });
        const userId = a?.user.id ?? "";
        const roles = yield* Effect.all(
          [context.role(userId), context.role(userId), context.user(userId)],
          { concurrency: "unbounded" },
        );
        const scope = yield* context.workspace(userId);
        const again = yield* context.workspace(userId);
        const memberships = yield* context.memberships(userId);
        return { a, b, roles, scope, again, memberships };
      }),
    );
    expect(result.a?.user.email).toBe(signedIn.email);
    expect(result.b).toBe(result.a);
    expect(result.roles[0]).toBe("admin");
    expect(result.roles[1]).toBe("admin");
    expect(result.roles[2]?.role).toBe("admin");
    expect(result.scope?.role).toBe("owner");
    expect(result.again).toBe(result.scope);
    expect(result.memberships).toHaveLength(1);
    expect(counts()).toEqual({ session: 1, user: 1, membership: 1 });
  });

  it("refuses a session whose user row is gone, even when the cookie cache still vouches for it", async () => {
    const gone = await runtime.runPromise(
      Effect.flatMap(Auth, (auth) =>
        signInWithMagicLink(
          auth,
          baseUrl,
          links,
          `gone-${crypto.randomUUID()}@example.com`,
        ),
      ),
    );
    expect(gone.cacheCookie).toBeDefined();
    await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) =>
        db.delete(user).where(eq(user.email, gone.email)),
      ),
    );
    const headers = new Headers({ cookie: gone.cookie });

    // better-auth alone still answers from the signed cache, without a read...
    log.reset();
    const cached = await runtime.runPromise(
      Effect.flatMap(Auth, (auth) => auth.session(headers)),
    );
    expect(cached?.user.email).toBe(gone.email);
    expect(counts()).toEqual({ session: 0, user: 0, membership: 0 });

    // ...and the context's validated session is null at the cost of one user read.
    log.reset();
    const validated = await runtime.runPromise(
      Effect.flatMap(
        RequestContext.make(headers),
        (context) => context.session,
      ),
    );
    expect(validated).toBeNull();
    expect(counts()).toEqual({ session: 0, user: 1, membership: 0 });

    // So the request is 401, however fresh the cache looks.
    const response = await handler(
      new Request("http://localhost/me", { headers: { cookie: gone.cookie } }),
    );
    expect(response.status).toBe(401);
  });

  it("is absent from the fiber context unless provided", async () => {
    const current = await Effect.runPromise(RequestContext.current);
    expect(current._tag).toBe("None");
  });
});
