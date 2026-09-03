/**
 * The credential and role middlewares, observed from outside: raw `Request`s
 * into `HttpRouter.toWebHandler`, statuses and bodies out. Every rule in
 * docs/API_AUTH.md "Implementation rules (Phase 3)" has a case here.
 */
import { Database } from "@gmacko/db";
import {
  applicationSettings,
  user,
  workspace,
  workspaceMembership,
} from "@gmacko/db/schema";
import { layerTest } from "@gmacko/db/testing";
import { eq } from "drizzle-orm";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiKeys } from "../api-keys";
import type { MagicLink } from "../index";
import { AuthSecurityConfig } from "../security-config";
import { Auth } from "../service";
import {
  countingDatabase,
  makeStatementLog,
  type SignedIn,
  signInWithMagicLink,
  testAuthOptions,
} from "../testing";
import { jsonOf, makeTestHandler } from "./test-api";

const baseUrl = "http://localhost:3001";
const foreignOrigin = "https://evil.example";
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

describe("security middlewares", () => {
  let runtime: ManagedRuntime.ManagedRuntime<
    Auth | Database | AuthSecurityConfig,
    never
  >;
  let handler: (request: Request) => Promise<Response>;
  let dispose: () => Promise<void>;
  let signedIn: SignedIn;

  const run = <A, E>(effect: Effect.Effect<A, E, Auth | Database | ApiKeys>) =>
    runtime.runPromise(Effect.provide(effect, ApiKeys.layer));

  const call = (
    method: string,
    path: string,
    headers: Record<string, string> = {},
  ) => handler(new Request(`http://localhost${path}`, { method, headers }));

  const signIn = (label: string) =>
    run(
      Effect.flatMap(Auth, (auth) =>
        signInWithMagicLink(
          auth,
          baseUrl,
          links,
          `${label}-${crypto.randomUUID()}@example.com`,
        ),
      ),
    );

  const mintKey = (
    email: string,
    permissions: ReadonlyArray<"read" | "write" | "delete" | "admin">,
    expiresAt?: Date,
  ) =>
    run(
      Effect.gen(function* () {
        const { db } = yield* Database;
        const api = yield* ApiKeys;
        const [owner] = yield* db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, email));
        if (!owner) throw new Error(`no user ${email}`);
        return yield* api.create(owner.id, {
          name: `key-${permissions.join("+")}`,
          permissions,
          expiresAt,
        });
      }),
    );

  beforeAll(async () => {
    runtime = ManagedRuntime.make(Services);
    const api = makeTestHandler(Services, runtime.memoMap);
    handler = api.handler;
    dispose = api.dispose;
    signedIn = await signIn("cookie");
  });
  afterAll(async () => {
    await dispose();
    await runtime.dispose();
  });

  describe("no credential", () => {
    it("answers 401 Unauthorized on every protected endpoint, 200 on public", async () => {
      for (const [method, path] of [
        ["GET", "/me"],
        ["POST", "/session-only"],
        ["GET", "/read"],
        ["POST", "/write"],
        ["GET", "/admin"],
        ["GET", "/workspace"],
      ] as const) {
        const response = await call(method, path);
        expect(response.status, `${method} ${path}`).toBe(401);
        expect(await jsonOf(response)).toMatchObject({ _tag: "Unauthorized" });
      }
      const open = await call("GET", "/public");
      expect(open.status).toBe(200);
    });

    it("treats an unparseable cookie as anonymous, not as an error", async () => {
      const response = await call("GET", "/me", {
        cookie: "better-auth.session_token=not-a-real-token",
      });
      expect(response.status).toBe(401);
    });
  });

  describe("cookie session", () => {
    it("provides CurrentUser with credential 'session' on Session and SessionOrKey endpoints", async () => {
      for (const path of ["/me", "/read"] as const) {
        const response = await call("GET", path, { cookie: signedIn.cookie });
        expect(response.status, path).toBe(200);
        expect(await jsonOf(response)).toMatchObject({
          email: signedIn.email,
          role: "user",
          credential: "session",
        });
      }
    });

    it("401 once the user row is deleted, even with the cookie cache sent (rule 5)", async () => {
      const fresh = await signIn("deleted");
      expect(fresh.cacheCookie).toBeDefined();
      await run(
        Effect.flatMap(Database, ({ db }) =>
          db.delete(user).where(eq(user.email, fresh.email)),
        ),
      );
      for (const path of ["/me", "/read"] as const) {
        const response = await call("GET", path, { cookie: fresh.cookie });
        expect(response.status, path).toBe(401);
      }
    });

    it("refuses a non-GET request from a foreign Origin with 403 Forbidden(origin)", async () => {
      const response = await call("POST", "/write", {
        cookie: signedIn.cookie,
        origin: foreignOrigin,
      });
      expect(response.status).toBe(403);
      expect(await jsonOf(response)).toEqual({
        _tag: "Forbidden",
        reason: "origin",
      });

      const sessionOnly = await call("POST", "/session-only", {
        cookie: signedIn.cookie,
        origin: foreignOrigin,
      });
      expect(sessionOnly.status).toBe(403);
      expect(await jsonOf(sessionOnly)).toEqual({
        _tag: "Forbidden",
        reason: "origin",
      });
    });

    it("reads the session exactly once when refusing a foreign Origin (one path, one RequestContext)", async () => {
      // Only the session token: with the cookie cache (session_data) sent,
      // better-auth would skip the read and hide what is being measured.
      log.reset();
      const response = await call("POST", "/write", {
        cookie: signedIn.sessionCookie,
        origin: foreignOrigin,
      });
      expect(response.status).toBe(403);
      expect(await jsonOf(response)).toEqual({
        _tag: "Forbidden",
        reason: "origin",
      });
      expect(log.touching("plain", "session")).toBe(1);
    });

    it("refuses a non-GET request with neither Origin nor Sec-Fetch-Site", async () => {
      const response = await call("POST", "/write", {
        cookie: signedIn.cookie,
      });
      expect(response.status).toBe(403);
      expect(await jsonOf(response)).toEqual({
        _tag: "Forbidden",
        reason: "origin",
      });
    });

    it("accepts a non-GET request from an allowlisted Origin or a same-origin fetch", async () => {
      const allowlisted = await call("POST", "/write", {
        cookie: signedIn.cookie,
        origin: baseUrl,
      });
      expect(allowlisted.status).toBe(200);
      expect(await jsonOf(allowlisted)).toMatchObject({
        credential: "session",
      });

      const sameOrigin = await call("POST", "/session-only", {
        cookie: signedIn.cookie,
        "sec-fetch-site": "same-origin",
      });
      expect(sameOrigin.status).toBe(200);
    });

    it("accepts GET regardless of Origin", async () => {
      const response = await call("GET", "/read", {
        cookie: signedIn.cookie,
        origin: foreignOrigin,
      });
      expect(response.status).toBe(200);
    });
  });

  describe("API keys", () => {
    it("200 with a read key on a SessionOrKey(read) endpoint, credential 'key'", async () => {
      const key = await mintKey(signedIn.email, ["read"]);
      const response = await call("GET", "/read", {
        authorization: `Bearer ${key.key}`,
      });
      expect(response.status).toBe(200);
      expect(await jsonOf(response)).toMatchObject({
        email: signedIn.email,
        credential: "key",
      });
    });

    it("403 Forbidden(scope) with a read key on a write endpoint (regression: previously allowed)", async () => {
      const key = await mintKey(signedIn.email, ["read"]);
      const response = await call("POST", "/write", {
        authorization: `Bearer ${key.key}`,
      });
      expect(response.status).toBe(403);
      expect(await jsonOf(response)).toEqual({
        _tag: "Forbidden",
        reason: "scope",
      });
    });

    it("200 with a write key on a write endpoint, and with an admin key anywhere", async () => {
      const write = await mintKey(signedIn.email, ["write"]);
      const written = await call("POST", "/write", {
        authorization: `Bearer ${write.key}`,
      });
      expect(written.status).toBe(200);

      const admin = await mintKey(signedIn.email, ["admin"]);
      for (const [method, path] of [
        ["GET", "/read"],
        ["POST", "/write"],
      ] as const) {
        const response = await call(method, path, {
          authorization: `Bearer ${admin.key}`,
        });
        expect(response.status, `${method} ${path}`).toBe(200);
      }
    });

    it("keys never need an Origin: a POST with a key and a foreign Origin passes", async () => {
      const write = await mintKey(signedIn.email, ["write"]);
      const response = await call("POST", "/write", {
        authorization: `Bearer ${write.key}`,
        origin: foreignOrigin,
      });
      expect(response.status).toBe(200);
    });

    it("403 Forbidden(scope) for any bearer on a Session-only endpoint, even a valid admin key", async () => {
      const admin = await mintKey(signedIn.email, ["admin"]);
      for (const bearer of [admin.key, "gmk_garbage", "not-a-gmk-token"]) {
        const response = await call("GET", "/me", {
          authorization: `Bearer ${bearer}`,
          cookie: signedIn.cookie,
        });
        expect(response.status, bearer).toBe(403);
        expect(await jsonOf(response)).toEqual({
          _tag: "Forbidden",
          reason: "scope",
        });
      }
    });

    it("401 for an expired or revoked key, with no fall-through to a valid cookie in the same request", async () => {
      const expired = await mintKey(
        signedIn.email,
        ["admin"],
        new Date(Date.now() - 60_000),
      );
      const revoked = await mintKey(signedIn.email, ["admin"]);
      await run(
        Effect.gen(function* () {
          const api = yield* ApiKeys;
          const { db } = yield* Database;
          const [owner] = yield* db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, signedIn.email));
          yield* api.revoke(owner!.id, revoked.id);
        }),
      );

      for (const bearer of [expired.key, revoked.key, "gmk_unknown"]) {
        const response = await call("GET", "/read", {
          authorization: `Bearer ${bearer}`,
          cookie: signedIn.cookie,
          origin: baseUrl,
        });
        expect(response.status, bearer).toBe(401);
        expect(await jsonOf(response)).toMatchObject({ _tag: "Unauthorized" });
      }
    });

    it("touches lastUsedAt only when the key authenticated", async () => {
      const live = await mintKey(signedIn.email, ["read"]);
      const expired = await mintKey(
        signedIn.email,
        ["read"],
        new Date(Date.now() - 60_000),
      );
      await call("GET", "/read", { authorization: `Bearer ${live.key}` });
      await call("GET", "/read", { authorization: `Bearer ${expired.key}` });
      // A valid key lacking the scope still authenticated: it was used.
      const scoped = await mintKey(signedIn.email, ["read"]);
      await call("POST", "/write", { authorization: `Bearer ${scoped.key}` });

      const rows = await run(
        Effect.gen(function* () {
          const api = yield* ApiKeys;
          const { db } = yield* Database;
          const [owner] = yield* db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, signedIn.email));
          return yield* api.list(owner!.id);
        }),
      );
      const byId = new Map(rows.map((row) => [row.id, row.lastUsedAt]));
      expect(byId.get(live.id)).toBeInstanceOf(Date);
      expect(byId.get(scoped.id)).toBeInstanceOf(Date);
      expect(byId.get(expired.id)).toBeNull();
    });
  });

  describe("AdminOnly", () => {
    it("403 Forbidden(role) for a non-admin session and for a non-admin holding an admin key", async () => {
      const bySession = await call("GET", "/admin", {
        cookie: signedIn.cookie,
      });
      expect(bySession.status).toBe(403);
      expect(await jsonOf(bySession)).toEqual({
        _tag: "Forbidden",
        reason: "role",
      });

      const admin = await mintKey(signedIn.email, ["admin"]);
      const byKey = await call("GET", "/admin", {
        authorization: `Bearer ${admin.key}`,
      });
      expect(byKey.status).toBe(403);
      expect(await jsonOf(byKey)).toEqual({
        _tag: "Forbidden",
        reason: "role",
      });
    });

    it("reads the role from the database, not from the cookie cache", async () => {
      const fresh = await signIn("admin");
      // The cookie cache (session_data) still says role "user"...
      expect(fresh.cacheCookie).toBeDefined();
      await run(
        Effect.flatMap(Database, ({ db }) =>
          db
            .update(user)
            .set({ role: "admin" })
            .where(eq(user.email, fresh.email)),
        ),
      );
      // ...yet the promotion applies on the very next request.
      const response = await call("GET", "/admin", { cookie: fresh.cookie });
      expect(response.status).toBe(200);
      expect(await jsonOf(response)).toMatchObject({
        email: fresh.email,
        role: "admin",
      });
    });
  });

  describe("WorkspaceRole", () => {
    const seedWorkspace = (ownerEmail: string) =>
      run(
        Effect.gen(function* () {
          const { db } = yield* Database;
          const [owner] = yield* db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, ownerEmail));
          const [ws] = yield* db
            .insert(workspace)
            .values({
              name: "Acme",
              slug: `acme-${crypto.randomUUID()}`,
              ownerUserId: owner!.id,
            })
            .returning();
          return ws!;
        }),
      );

    /** `role` is any string: the column is `text`, and one test stores a value the contract does not know. */
    const join = (email: string, workspaceId: string, role: string) =>
      run(
        Effect.gen(function* () {
          const { db } = yield* Database;
          const [member] = yield* db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, email));
          yield* db.insert(workspaceMembership).values({
            workspaceId,
            userId: member!.id,
            role: role as "member",
          });
        }),
      );

    it("403 Forbidden(role) for a user with no workspace", async () => {
      const lonely = await signIn("lonely");
      const response = await call("GET", "/workspace", {
        cookie: lonely.cookie,
      });
      expect(response.status).toBe(403);
      expect(await jsonOf(response)).toEqual({
        _tag: "Forbidden",
        reason: "role",
      });
    });

    it("resolves the current workspace from the earliest membership and ranks owner > admin > member", async () => {
      const member = await signIn("member");
      const ws = await seedWorkspace(member.email);
      await join(member.email, ws.id, "member");

      const asMember = await call("GET", "/workspace", {
        cookie: member.cookie,
      });
      expect(asMember.status).toBe(200);
      const needsAdmin = await call("GET", "/workspace-admin", {
        cookie: member.cookie,
      });
      expect(needsAdmin.status).toBe(403);
      expect(await jsonOf(needsAdmin)).toEqual({
        _tag: "Forbidden",
        reason: "role",
      });

      const admin = await signIn("wsadmin");
      await join(admin.email, ws.id, "admin");
      expect(
        (await call("GET", "/workspace-admin", { cookie: admin.cookie }))
          .status,
      ).toBe(200);
      expect(
        (await call("GET", "/workspace-owner", { cookie: admin.cookie }))
          .status,
      ).toBe(403);

      const owner = await signIn("wsowner");
      await join(owner.email, ws.id, "owner");
      expect(
        (await call("GET", "/workspace-owner", { cookie: owner.cookie }))
          .status,
      ).toBe(200);
    });

    it("fails closed on a stored role the contract does not know", async () => {
      const odd = await signIn("bogus-role");
      const ws = await seedWorkspace(odd.email);
      await join(odd.email, ws.id, "bogus");
      for (const path of ["/workspace", "/workspace-owner"] as const) {
        const response = await call("GET", path, { cookie: odd.cookie });
        expect(response.status, path).toBe(403);
        expect(await jsonOf(response)).toEqual({
          _tag: "Forbidden",
          reason: "role",
        });
      }
    });

    it("prefers the initial workspace from application settings when the user is a member of it", async () => {
      const person = await signIn("initial");
      const first = await seedWorkspace(person.email);
      const second = await seedWorkspace(person.email);
      await join(person.email, first.id, "member");
      await join(person.email, second.id, "admin");
      await run(
        Effect.flatMap(Database, ({ db }) =>
          db
            .insert(applicationSettings)
            .values({ initialWorkspaceId: second.id }),
        ),
      );
      try {
        const response = await call("GET", "/workspace-admin", {
          cookie: person.cookie,
        });
        expect(response.status).toBe(200);
      } finally {
        await run(
          Effect.flatMap(Database, ({ db }) =>
            db
              .delete(applicationSettings)
              .where(eq(applicationSettings.initialWorkspaceId, second.id)),
          ),
        );
      }
    });
  });
});

/**
 * Rule 4: in https stages better-auth names the cookie
 * `__Secure-better-auth.session_token`. The implementation hands better-auth
 * the raw `Cookie` header, so the secure name authenticates without the
 * contract (which declares the plain name) knowing about it.
 */
describe("secure-stage cookie name", () => {
  const secureUrl = "https://app.example";
  const secureLinks: Array<MagicLink> = [];
  const SecureServices = Layer.mergeAll(
    layerTest,
    Auth.layer(testAuthOptions(secureUrl, secureLinks)).pipe(
      Layer.provide(layerTest),
    ),
    Layer.succeed(AuthSecurityConfig)({
      allowedOrigins: [secureUrl],
      stage: "staging",
    }),
  );
  let runtime: ManagedRuntime.ManagedRuntime<
    Auth | Database | AuthSecurityConfig,
    never
  >;
  let handler: (request: Request) => Promise<Response>;
  let dispose: () => Promise<void>;

  beforeAll(() => {
    runtime = ManagedRuntime.make(SecureServices);
    const api = makeTestHandler(SecureServices, runtime.memoMap);
    handler = api.handler;
    dispose = api.dispose;
  });
  afterAll(async () => {
    await dispose();
    await runtime.dispose();
  });

  it("authenticates the __Secure- prefixed cookie", async () => {
    const signedIn = await runtime.runPromise(
      Effect.flatMap(Auth, (auth) =>
        Effect.gen(function* () {
          const email = `secure-${crypto.randomUUID()}@example.com`;
          yield* auth.handler(
            new Request(`${secureUrl}/api/auth/sign-in/magic-link`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                origin: secureUrl,
              },
              body: JSON.stringify({ email, callbackURL: "/" }),
            }),
          );
          const link = secureLinks.find((l) => l.email === email);
          if (!link) throw new Error("magic link was not sent");
          const verified = yield* auth.handler(
            new Request(link.url, { redirect: "manual" }),
          );
          const cookie = verified.headers
            .getSetCookie()
            .map((value) => value.split(";")[0] ?? "")
            .find((pair) =>
              pair.startsWith("__Secure-better-auth.session_token="),
            );
          if (!cookie) {
            throw new Error(
              `no secure cookie in ${verified.headers.getSetCookie().join(" | ")}`,
            );
          }
          return { email, cookie };
        }),
      ),
    );
    const response = await handler(
      new Request("https://app.example/read", {
        headers: { cookie: signedIn.cookie },
      }),
    );
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toMatchObject({
      email: signedIn.email,
      credential: "session",
    });
  });
});
