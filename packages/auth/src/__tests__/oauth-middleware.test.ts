/**
 * `RequireScope` with a `gmo_` OAuth access token (middleware.ts rule 7):
 * accepted only when the request carries `OAuthResource` (the `/mcp`
 * endpoint's dispatch) and the token is for that resource, holds the scope,
 * and its user is still in the pinned workspace — which then replaces the
 * default workspace for the request. Token rows are seeded directly; the
 * flow that mints them is proven in @gmacko/api's oauth/flow.test.ts.
 */
import { Database } from "@gmacko/db";
import {
  oauthAccessToken,
  oauthClient,
  user,
  workspace,
  workspaceMembership,
} from "@gmacko/db/schema";
import { layerTest } from "@gmacko/db/testing";
import { eq } from "drizzle-orm";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { HttpRouter } from "effect/http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sha256Hex } from "../api-keys";
import type { MagicLink } from "../index";
import { OAUTH_ACCESS_TOKEN_PREFIX } from "../oauth-provider";
import { OAuthResource } from "../oauth-tokens";
import { AuthSecurityConfig } from "../security-config";
import { Auth } from "../service";
import { signInWithMagicLink, testAuthOptions } from "../testing";
import { jsonOf, TestApiLive } from "./test-api";

const baseUrl = "http://localhost:3001";
const MCP = `${baseUrl}/mcp`;
const links: Array<MagicLink> = [];

const Services = Layer.mergeAll(
  layerTest,
  Auth.layer(testAuthOptions(baseUrl, links)).pipe(Layer.provide(layerTest)),
  Layer.succeed(AuthSecurityConfig)({
    allowedOrigins: [baseUrl],
    stage: "development",
  }),
);

let runtime: ManagedRuntime.ManagedRuntime<
  Auth | Database | AuthSecurityConfig,
  never
>;
let handler: (
  request: Request,
  context?: Context.Context<never>,
) => Promise<Response>;
let dispose: () => Promise<void>;

beforeAll(() => {
  runtime = ManagedRuntime.make(Services);
  const web = HttpRouter.toWebHandler(
    TestApiLive.pipe(Layer.provideMerge(Services)),
    { memoMap: runtime.memoMap, disableLogger: true },
  );
  handler = web.handler;
  dispose = web.dispose;
});
afterAll(async () => {
  await dispose();
  await runtime.dispose();
});

const run = <A, E>(effect: Effect.Effect<A, E, Auth | Database>) =>
  runtime.runPromise(effect);

/** A signed-in user owning workspace A (the default pick) and admin of B. */
const seed = async () => {
  const email = `oauth-${crypto.randomUUID()}@example.com`;
  await run(
    Effect.flatMap(Auth, (auth) =>
      signInWithMagicLink(auth, baseUrl, links, email),
    ),
  );
  return run(
    Effect.gen(function* () {
      const { db } = yield* Database;
      const [person] = yield* db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email));
      if (person === undefined) throw new Error("no user");
      const other = `other-${crypto.randomUUID()}`;
      yield* db.insert(user).values({
        id: other,
        name: "Other",
        email: `${other}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const a = crypto.randomUUID();
      const b = crypto.randomUUID();
      yield* db.insert(workspace).values([
        { id: a, name: "A", slug: a, ownerUserId: person.id },
        { id: b, name: "B", slug: b, ownerUserId: other },
      ]);
      yield* db.insert(workspaceMembership).values([
        {
          workspaceId: a,
          userId: person.id,
          role: "owner",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          workspaceId: b,
          userId: person.id,
          role: "admin",
          createdAt: new Date("2026-02-01T00:00:00Z"),
        },
      ]);
      const clientId = `client-${crypto.randomUUID()}`;
      yield* db.insert(oauthClient).values({
        id: crypto.randomUUID(),
        clientId,
        redirectUris: JSON.stringify(["http://127.0.0.1:1/cb"]),
      });
      return { userId: person.id, a, b, clientId };
    }),
  );
};

/** Inserts one access token row and answers the bearer that matches it. */
const mint = async (options: {
  readonly userId: string;
  readonly clientId: string;
  readonly workspaceId: string;
  readonly scopes: ReadonlyArray<string>;
  readonly resources?: ReadonlyArray<string>;
  readonly expiresAt?: Date;
  readonly revoked?: Date;
}) => {
  const raw = crypto.randomUUID().replaceAll("-", "");
  await run(
    Effect.flatMap(Database, ({ db }) =>
      Effect.flatMap(
        Effect.promise(() => sha256Hex(raw)),
        (hash) =>
          db.insert(oauthAccessToken).values({
            id: crypto.randomUUID(),
            token: hash,
            clientId: options.clientId,
            userId: options.userId,
            referenceId: options.workspaceId,
            resources: JSON.stringify(options.resources ?? [MCP]),
            scopes: JSON.stringify(options.scopes),
            expiresAt: options.expiresAt ?? new Date(Date.now() + 3_600_000),
            createdAt: new Date(),
            revoked: options.revoked ?? null,
          }),
      ),
    ),
  );
  return `${OAUTH_ACCESS_TOKEN_PREFIX}${raw}`;
};

const viaMcp = (resource = MCP) => Context.make(OAuthResource, { resource });

const call = (
  path: string,
  bearer: string,
  context?: Context.Context<never>,
  method = "GET",
) =>
  handler(
    new Request(`http://localhost${path}`, {
      method,
      headers: { authorization: `Bearer ${bearer}` },
    }),
    context,
  );

describe("RequireScope with an OAuth access token", () => {
  it("authenticates as credential 'oauth' on a request /mcp dispatched", async () => {
    const s = await seed();
    const token = await mint({
      ...s,
      workspaceId: s.a,
      scopes: ["profile:read"],
    });
    const response = await call("/read", token, viaMcp());
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toMatchObject({
      id: s.userId,
      credential: "oauth",
    });
  });

  it("is 401 as a direct API call, or for another resource", async () => {
    const s = await seed();
    const token = await mint({
      ...s,
      workspaceId: s.a,
      scopes: ["profile:read"],
    });
    expect((await call("/read", token)).status).toBe(401);
    expect(
      (await call("/read", token, viaMcp(`${baseUrl}/other`))).status,
    ).toBe(401);
  });

  it("is 403 Forbidden(scope) without the endpoint's scope", async () => {
    const s = await seed();
    const token = await mint({
      ...s,
      workspaceId: s.a,
      scopes: ["profile:read"],
    });
    const response = await call("/write", token, viaMcp(), "POST");
    expect(response.status).toBe(403);
    expect(await jsonOf(response)).toEqual({
      _tag: "Forbidden",
      reason: "scope",
    });
  });

  it("uses the pinned workspace, not the default one, for role checks", async () => {
    const s = await seed();
    // Default workspace is A (owner, earliest); pinned to B (admin).
    const pinnedB = await mint({
      ...s,
      workspaceId: s.b,
      scopes: ["workspace:read"],
    });
    expect((await call("/workspace-admin", pinnedB, viaMcp())).status).toBe(
      200,
    );
    expect((await call("/workspace-owner", pinnedB, viaMcp())).status).toBe(
      403,
    );
    const pinnedA = await mint({
      ...s,
      workspaceId: s.a,
      scopes: ["workspace:read"],
    });
    expect((await call("/workspace-owner", pinnedA, viaMcp())).status).toBe(
      200,
    );
  });

  it("is 401 once the user leaves the pinned workspace", async () => {
    const s = await seed();
    const token = await mint({
      ...s,
      workspaceId: s.b,
      scopes: ["profile:read"],
    });
    expect((await call("/read", token, viaMcp())).status).toBe(200);
    await run(
      Effect.flatMap(Database, ({ db }) =>
        db
          .delete(workspaceMembership)
          .where(eq(workspaceMembership.workspaceId, s.b)),
      ),
    );
    expect((await call("/read", token, viaMcp())).status).toBe(401);
  });

  it("is 401 for an expired, revoked, unknown or disabled-client token", async () => {
    const s = await seed();
    const expired = await mint({
      ...s,
      workspaceId: s.a,
      scopes: ["profile:read"],
      expiresAt: new Date(Date.now() - 1000),
    });
    const revoked = await mint({
      ...s,
      workspaceId: s.a,
      scopes: ["profile:read"],
      revoked: new Date(),
    });
    for (const bearer of [
      expired,
      revoked,
      `${OAUTH_ACCESS_TOKEN_PREFIX}nope`,
    ]) {
      expect((await call("/read", bearer, viaMcp())).status, bearer).toBe(401);
    }
    const live = await mint({
      ...s,
      workspaceId: s.a,
      scopes: ["profile:read"],
    });
    await run(
      Effect.flatMap(Database, ({ db }) =>
        db
          .update(oauthClient)
          .set({ disabled: true })
          .where(eq(oauthClient.clientId, s.clientId)),
      ),
    );
    expect((await call("/read", live, viaMcp())).status).toBe(401);
  });
});
