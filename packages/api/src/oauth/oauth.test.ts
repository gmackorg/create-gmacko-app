/**
 * The workspace picker behind `/oauth/workspace`: the memberships it offers,
 * the per-session pick it records, and that it acts on the browser session
 * only, never for a workspace the caller does not belong to.
 */
import { selectedWorkspace } from "@gmacko/auth/oauth-provider";
import { Database } from "@gmacko/db";
import { session as sessionTable, user } from "@gmacko/db/schema";
import { ALL_SCOPES, SelectOAuthWorkspace, WorkspaceId } from "@gmacko/domain";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeTestApi, type TestApi } from "../testing";

let api: TestApi;
beforeAll(() => {
  api = makeTestApi();
});
afterAll(() => api.dispose());

/** The session rows a user has, newest first. */
const sessionsOf = (email: string) =>
  api.run(
    Effect.gen(function* () {
      const { db } = yield* Database;
      return yield* db
        .select({ id: sessionTable.id, userId: sessionTable.userId })
        .from(sessionTable)
        .innerJoin(user, eq(user.id, sessionTable.userId))
        .where(eq(user.email, email));
    }),
  );

describe("oauth.workspaces / oauth.selectWorkspace", () => {
  it("lists the caller's memberships and records this session's pick", async () => {
    const person = await api.createUser();
    const other = await api.createUser();
    const atlas = await api.createWorkspace({ owner: person, name: "Atlas" });
    const beacon = await api.createWorkspace({
      owner: other,
      name: "Beacon",
      members: [{ user: person, role: "member" }],
    });

    const before = await api.call((c) => c.oauth.workspaces(), {
      cookie: person.cookie,
    });
    expect(before.selected).toBeNull();
    // Earliest membership first; both rows land in the same millisecond
    // here, so compare as a set.
    expect(before.workspaces.map((w) => [w.name, w.role]).sort()).toEqual([
      ["Atlas", "owner"],
      ["Beacon", "member"],
    ]);

    const picked = await api.call(
      (c) =>
        c.oauth.selectWorkspace({
          payload: new SelectOAuthWorkspace({
            workspaceId: WorkspaceId.make(beacon.id),
          }),
        }),
      { cookie: person.cookie },
    );
    expect(picked.selected).toBe(beacon.id);

    // Picking again replaces the session's row rather than adding one.
    await api.call(
      (c) =>
        c.oauth.selectWorkspace({
          payload: new SelectOAuthWorkspace({
            workspaceId: WorkspaceId.make(atlas.id),
          }),
        }),
      { cookie: person.cookie },
    );
    const [session] = await sessionsOf(person.email);
    if (session === undefined) throw new Error("no session");
    await expect(
      api.run(
        // gmacko-standards-disable-next-line no-plain-drizzle-in-api -- `selectedWorkspace` is the OAuth plugin's read; it runs on better-auth's promise handle, so the test calls it the same way
        Effect.flatMap(Database, ({ plain }) =>
          Effect.promise(() => selectedWorkspace(plain, session)),
        ),
      ),
    ).resolves.toBe(atlas.id);
  });

  it("is NotFound for a workspace the caller is not a member of", async () => {
    const person = await api.createUser();
    const stranger = await api.createUser();
    const theirs = await api.createWorkspace({ owner: stranger });
    const failure = await api.failure(
      (c) =>
        c.oauth.selectWorkspace({
          payload: new SelectOAuthWorkspace({
            workspaceId: WorkspaceId.make(theirs.id),
          }),
        }),
      { cookie: person.cookie },
    );
    expect(failure).toMatchObject({ _tag: "NotFound", resource: "workspace" });
  });

  it("forgets a pick once the membership is gone", async () => {
    const owner = await api.createUser();
    const person = await api.createUser();
    const shared = await api.createWorkspace({
      owner,
      members: [{ user: person, role: "member" }],
    });
    await api.call(
      (c) =>
        c.oauth.selectWorkspace({
          payload: new SelectOAuthWorkspace({
            workspaceId: WorkspaceId.make(shared.id),
          }),
        }),
      { cookie: person.cookie },
    );
    await api.run(
      Effect.gen(function* () {
        const { sql } = yield* Database;
        yield* sql`delete from workspace_membership where workspace_id = ${shared.id} and user_id = ${person.id}`;
      }),
    );
    const after = await api.call((c) => c.oauth.workspaces(), {
      cookie: person.cookie,
    });
    expect(after.selected).toBeNull();
    expect(after.workspaces).toEqual([]);
    const [session] = await sessionsOf(person.email);
    if (session === undefined) throw new Error("no session");
    await expect(
      api.run(
        // gmacko-standards-disable-next-line no-plain-drizzle-in-api -- `selectedWorkspace` is the OAuth plugin's read; it runs on better-auth's promise handle, so the test calls it the same way
        Effect.flatMap(Database, ({ plain }) =>
          Effect.promise(() => selectedWorkspace(plain, session)),
        ),
      ),
    ).resolves.toBeNull();
  });

  it("is session only: a bearer key, even one holding every scope, is Forbidden(scope)", async () => {
    const person = await api.createUser();
    const key = await api.createApiKey(person, ALL_SCOPES);
    const response = await api.fetch("/api/oauth/workspaces", {
      headers: { authorization: `Bearer ${key.key}` },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      _tag: "Forbidden",
      reason: "scope",
    });
  });
});
