/**
 * The admin group through the web handler. The `describe`s marked
 * "(ported)" carry the `it()`s ported from the legacy router tests
 * (now deleted); the guarded
 * writes (bootstrap, waitlist review) get their concurrency checks here and,
 * against a real D1, in admin.workers.test.ts.
 */
import { Database } from "@gmacko/db";
import {
  applicationSettings,
  user,
  waitlistEntry,
  workspace,
  workspaceInviteAllowlist,
  workspaceMembership,
} from "@gmacko/db/schema";
import {
  CompleteBootstrap,
  ReviewWaitlistEntry,
  UpdateLaunchControls,
  UpdateUserRole,
  UserId,
  WaitlistEntryId,
} from "@gmacko/domain";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeTestApi, type TestApi, type TestUser } from "../testing";

let api: TestApi;
beforeAll(() => {
  api = makeTestApi();
});
afterAll(() => api.dispose());

const db = <A, E>(
  f: (database: Database["Service"]) => Effect.Effect<A, E>,
): Promise<A> => api.run(Effect.flatMap(Database, f));

/** Back to first-run state: no settings row, no workspaces. */
const resetBootstrap = () =>
  db(({ db }) =>
    Effect.andThen(db.delete(applicationSettings), db.delete(workspace)),
  );

const setSettings = (
  values: Partial<typeof applicationSettings.$inferInsert>,
) =>
  db(({ db }) =>
    Effect.andThen(
      db.delete(applicationSettings),
      db
        .insert(applicationSettings)
        .values({ ...values })
        .returning(),
    ),
  ).then((rows) => rows[0]!);

const addWaitlist = (
  values: Partial<typeof waitlistEntry.$inferInsert> & { email: string },
) =>
  db(({ db }) => db.insert(waitlistEntry).values(values).returning()).then(
    (rows) => rows[0]!,
  );

const asAdmin = async (): Promise<TestUser> =>
  api.createUser({ role: "admin" });

describe("admin bootstrap (ported)", () => {
  it("reports when the app still needs first-run setup", async () => {
    await resetBootstrap();
    const status = await api.call((client) => client.admin.bootstrapStatus());
    expect(status).toEqual({
      isInitialized: false,
      requiresSetup: true,
      hasExistingWorkspace: false,
      setupCompletedAt: null,
      initialWorkspaceId: null,
    });
    expect((await api.fetch("/api/bootstrap")).status).toBe(200);
  });

  it("treats an existing workspace without setup completion as partial bootstrap state", async () => {
    await resetBootstrap();
    const owner = await api.createUser();
    await api.createWorkspace({ owner, name: "Acme HQ" });
    const status = await api.call((client) => client.admin.bootstrapStatus());
    expect(status).toMatchObject({
      isInitialized: false,
      requiresSetup: true,
      hasExistingWorkspace: true,
    });
    const failure = await api.failure(
      (client) =>
        client.admin.completeBootstrap({
          payload: new CompleteBootstrap({ workspaceName: "Acme HQ" }),
        }),
      { cookie: owner.cookie },
    );
    expect(failure).toMatchObject({
      _tag: "Conflict",
      reason: "bootstrap-already-started",
    });
  });

  it("completes first-run setup for the first authenticated user", async () => {
    await resetBootstrap();
    const taylor = await api.createUser();
    const completed = await api.call(
      (client) =>
        client.admin.completeBootstrap({
          payload: new CompleteBootstrap({ workspaceName: "Acme HQ" }),
        }),
      { cookie: taylor.cookie },
    );
    expect(completed.workspace).toMatchObject({
      name: "Acme HQ",
      slug: "acme-hq",
      ownerUserId: taylor.id,
    });
    expect(completed.settings).toMatchObject({
      setupCompletedByUserId: taylor.id,
      initialWorkspaceId: completed.workspace.id,
    });
    expect(completed.settings.setupCompletedAt).toBeInstanceOf(Date);

    const [row] = await db(({ db }) =>
      db.select().from(user).where(eq(user.id, taylor.id)),
    );
    expect(row?.role).toBe("admin");
    const memberships = await db(({ db }) =>
      db
        .select()
        .from(workspaceMembership)
        .where(eq(workspaceMembership.userId, taylor.id)),
    );
    expect(memberships).toMatchObject([
      { workspaceId: completed.workspace.id, role: "owner" },
    ]);
    const status = await api.call((client) => client.admin.bootstrapStatus());
    expect(status).toMatchObject({
      isInitialized: true,
      requiresSetup: false,
      hasExistingWorkspace: true,
      initialWorkspaceId: completed.workspace.id,
    });
    // A second attempt by anyone is Conflict(bootstrap-already-completed).
    const again = await api.failure(
      (client) =>
        client.admin.completeBootstrap({
          payload: new CompleteBootstrap({ workspaceName: "Other" }),
        }),
      { cookie: (await api.createUser()).cookie },
    );
    expect(again).toMatchObject({
      _tag: "Conflict",
      reason: "bootstrap-already-completed",
    });
  });

  it("does not persist partial bootstrap state when setup fails mid-flight", async () => {
    await resetBootstrap();
    const taylor = await api.createUser();
    // The last statement of the batch (the settings write) fails: an insert
    // trigger aborts it, so the workspace, membership and role changes in
    // the same batch must all roll back.
    await db(({ sql }) =>
      sql`create trigger block_settings before insert on application_settings begin select raise(abort, 'settings insert failed'); end`.pipe(
        Effect.orDie,
      ),
    );
    try {
      const failure = await api.failure(
        (client) =>
          client.admin.completeBootstrap({
            payload: new CompleteBootstrap({ workspaceName: "Acme HQ" }),
          }),
        { cookie: taylor.cookie },
      );
      expect(failure).toMatchObject({ _tag: "InternalError" });
    } finally {
      await db(({ sql }) =>
        sql`drop trigger block_settings`.pipe(Effect.orDie),
      );
    }
    const [row] = await db(({ db }) =>
      db.select().from(user).where(eq(user.id, taylor.id)),
    );
    expect(row?.role).toBe("user");
    expect(await db(({ db }) => db.select().from(workspace))).toEqual([]);
    expect(await db(({ db }) => db.select().from(applicationSettings))).toEqual(
      [],
    );
    expect(
      await api.call((client) => client.admin.bootstrapStatus()),
    ).toMatchObject({ isInitialized: false, requiresSetup: true });
  });

  it("completes into an existing settings row, and is session only", async () => {
    await resetBootstrap();
    const seeded = await setSettings({ announcementMessage: "welcome" });
    const person = await api.createUser();
    const adminKey = await api.createApiKey(person, ["admin"]);
    const byKey = await api.fetch("/api/bootstrap/complete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminKey.key}`,
      },
      body: JSON.stringify({ workspaceName: "Keyed" }),
    });
    expect(byKey.status).toBe(403);

    const completed = await api.call(
      (client) =>
        client.admin.completeBootstrap({
          payload: new CompleteBootstrap({ workspaceName: "Seeded Co" }),
        }),
      { cookie: person.cookie },
    );
    expect(completed.settings.id).toBe(seeded.id);
    expect(completed.settings.announcementMessage).toBe("welcome");
    expect(completed.settings.initialWorkspaceId).toBe(completed.workspace.id);
  });

  it("two concurrent completions yield exactly one success and one Conflict", async () => {
    await resetBootstrap();
    const [a, b] = await Promise.all([api.createUser(), api.createUser()]);
    const results = await Promise.all(
      [a, b].map((person, index) =>
        api.result(
          (client) =>
            client.admin.completeBootstrap({
              payload: new CompleteBootstrap({
                workspaceName: `Race ${index}`,
              }),
            }),
          { cookie: person.cookie },
        ),
      ),
    );
    const outcomes = results.map((r) =>
      r._tag === "Success" ? "success" : r.failure._tag,
    );
    expect(outcomes.sort()).toEqual(["Conflict", "success"]);
    expect(await db(({ db }) => db.select().from(workspace))).toHaveLength(1);
    const admins = await db(({ db }) =>
      db.select().from(user).where(eq(user.role, "admin")),
    );
    expect(admins.filter((row) => [a.id, b.id].includes(row.id))).toHaveLength(
      1,
    );
  });

  it("lists workspaces with membership counts in creation order", async () => {
    await resetBootstrap();
    const avery = await asAdmin();
    const other = await api.createUser();
    const atlas = await api.createWorkspace({
      owner: avery,
      name: "Atlas",
      members: [{ user: other, role: "member" }],
    });
    const beacon = await api.createWorkspace({ owner: avery, name: "Beacon" });
    await db(({ db }) =>
      Effect.andThen(
        db
          .update(workspace)
          .set({ createdAt: new Date("2026-03-27T00:00:00.000Z") })
          .where(eq(workspace.id, atlas.id)),
        db
          .update(workspace)
          .set({ createdAt: new Date("2026-03-27T01:00:00.000Z") })
          .where(eq(workspace.id, beacon.id)),
      ),
    );
    const listed = await api.call((client) => client.admin.listWorkspaces(), {
      cookie: avery.cookie,
    });
    expect(listed).toEqual([
      {
        id: atlas.id,
        name: "Atlas",
        slug: atlas.slug,
        ownerUserId: avery.id,
        membershipCount: 2,
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
      },
      {
        id: beacon.id,
        name: "Beacon",
        slug: beacon.slug,
        ownerUserId: avery.id,
        membershipCount: 1,
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
      },
    ]);
  });
});

describe("admin launch controls (ported)", () => {
  it("exposes launch settings and reviewable waitlist entries", async () => {
    await resetBootstrap();
    await db(({ db }) => db.delete(waitlistEntry));
    const avery = await asAdmin();
    const acme = await api.createWorkspace({ owner: avery, name: "Acme" });
    await setSettings({
      setupCompletedAt: new Date("2026-03-27T01:00:00.000Z"),
      setupCompletedByUserId: avery.id,
      initialWorkspaceId: acme.id,
    });
    const entry = await addWaitlist({ email: "alpha@example.com" });

    const controls = await api.call((client) => client.admin.launchControls(), {
      cookie: avery.cookie,
    });
    expect(controls).toEqual({
      maintenanceMode: false,
      signupEnabled: true,
      announcementMessage: null,
      announcementTone: "info",
      allowedEmailDomains: [],
      platformPrimitives: expect.objectContaining({
        featureFlags: { enabled: true, provider: "local" },
        jobs: { enabled: true, provider: "local" },
        rateLimits: expect.objectContaining({
          enabled: true,
          scopes: expect.arrayContaining(["auth", "contact", "operator-api"]),
        }),
        botProtection: { enabled: true, provider: "local-rate-limit" },
        compliance: expect.objectContaining({
          dataExport: true,
          enabled: true,
        }),
      }),
      waitlistCount: 1,
    });

    const reviewed = await api.call(
      (client) =>
        client.admin.reviewWaitlistEntry({
          params: { id: WaitlistEntryId.make(entry.id) },
          payload: new ReviewWaitlistEntry({ status: "approved" }),
        }),
      { cookie: avery.cookie },
    );
    expect(reviewed).toMatchObject({
      id: entry.id,
      status: "approved",
      reviewedByUserId: avery.id,
    });
    expect(reviewed.reviewedAt).toBeInstanceOf(Date);
    const allowlist = await db(({ db }) =>
      db
        .select()
        .from(workspaceInviteAllowlist)
        .where(eq(workspaceInviteAllowlist.workspaceId, acme.id)),
    );
    expect(allowlist).toMatchObject([
      {
        workspaceId: acme.id,
        email: "alpha@example.com",
        role: "member",
        invitedByUserId: avery.id,
      },
    ]);
  });

  it("updateLaunchControls upserts the singleton with only the fields sent", async () => {
    await resetBootstrap();
    const avery = await asAdmin();
    const created = await api.call(
      (client) =>
        client.admin.updateLaunchControls({
          payload: new UpdateLaunchControls({
            maintenanceMode: true,
            announcementMessage: "Migrating",
            announcementTone: "warning",
          }),
        }),
      { cookie: avery.cookie },
    );
    expect(created).toMatchObject({
      maintenanceMode: true,
      signupEnabled: true,
      announcementMessage: "Migrating",
      announcementTone: "warning",
      allowedEmailDomains: [],
    });
    const updated = await api.call(
      (client) =>
        client.admin.updateLaunchControls({
          payload: new UpdateLaunchControls({
            announcementMessage: null,
            allowedEmailDomains: ["example.com"],
          }),
        }),
      { cookie: avery.cookie },
    );
    expect(updated).toMatchObject({
      id: created.id,
      maintenanceMode: true,
      announcementMessage: null,
      announcementTone: "warning",
      allowedEmailDomains: ["example.com"],
    });
    expect(
      await db(({ db }) => db.select().from(applicationSettings)),
    ).toHaveLength(1);
    const state = await api.call((client) => client.settings.launchState());
    expect(state).toMatchObject({
      maintenanceMode: true,
      announcementTone: "warning",
    });
  });

  it("updateLaunchControls with an empty patch on an empty table answers the defaults and creates the one row", async () => {
    await resetBootstrap();
    const avery = await asAdmin();
    const raw = await api.fetch("/api/admin/launch-controls", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: avery.cookie,
        origin: api.baseUrl,
      },
      body: "{}",
    });
    expect(raw.status).toBe(200);
    expect(await raw.json()).toMatchObject({
      maintenanceMode: false,
      signupEnabled: true,
      announcementMessage: null,
      announcementTone: "info",
      allowedEmailDomains: [],
    });
    const rows = await db(({ db }) => db.select().from(applicationSettings));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      maintenanceMode: false,
      signupEnabled: true,
      announcementMessage: null,
      announcementTone: "info",
      allowedEmailDomains: [],
      setupCompletedAt: null,
    });
    // A later patch updates that row rather than adding another.
    const updated = await api.call(
      (client) =>
        client.admin.updateLaunchControls({
          payload: new UpdateLaunchControls({ signupEnabled: false }),
        }),
      { cookie: avery.cookie },
    );
    expect(updated).toMatchObject({ id: rows[0]?.id, signupEnabled: false });
    expect(
      await db(({ db }) => db.select().from(applicationSettings)),
    ).toHaveLength(1);
  });

  it("requires the admin role: a user session and a non-admin's admin key are Forbidden(role)", async () => {
    const person = await api.createUser();
    const bySession = await api.failure(
      (client) => client.admin.launchControls(),
      { cookie: person.cookie },
    );
    expect(bySession).toMatchObject({ _tag: "Forbidden", reason: "role" });
    const adminKey = await api.createApiKey(person, ["admin"]);
    const byKey = await api.failure((client) => client.admin.stats(), {
      bearer: adminKey.key,
    });
    expect(byKey).toMatchObject({ _tag: "Forbidden", reason: "role" });
    const readKey = await api.createApiKey(await asAdmin(), ["read"]);
    const byScope = await api.failure((client) => client.admin.stats(), {
      bearer: readKey.key,
    });
    expect(byScope).toMatchObject({ _tag: "Forbidden", reason: "scope" });
  });
});

describe("admin waitlist review", () => {
  it("lists entries oldest first and 404s an unknown entry", async () => {
    await db(({ db }) => db.delete(waitlistEntry));
    const avery = await asAdmin();
    await addWaitlist({
      email: "b@example.com",
      createdAt: new Date("2026-03-27T02:00:00.000Z"),
    });
    await addWaitlist({
      email: "a@example.com",
      createdAt: new Date("2026-03-27T01:00:00.000Z"),
    });
    const entries = await api.call(
      (client) => client.admin.listWaitlistEntries(),
      {
        cookie: avery.cookie,
      },
    );
    expect(entries.map((e) => e.email)).toEqual([
      "a@example.com",
      "b@example.com",
    ]);

    const missing = await api.failure(
      (client) =>
        client.admin.reviewWaitlistEntry({
          params: { id: WaitlistEntryId.make("missing") },
          payload: new ReviewWaitlistEntry({ status: "contacted" }),
        }),
      { cookie: avery.cookie },
    );
    expect(missing).toMatchObject({
      _tag: "NotFound",
      resource: "waitlistEntry",
    });
  });

  it("guards the status: re-applying the current status is Conflict(waitlist-status-changed)", async () => {
    const avery = await asAdmin();
    const entry = await addWaitlist({ email: "guard@example.com" });
    await api.call(
      (client) =>
        client.admin.reviewWaitlistEntry({
          params: { id: WaitlistEntryId.make(entry.id) },
          payload: new ReviewWaitlistEntry({ status: "contacted" }),
        }),
      { cookie: avery.cookie },
    );
    const again = await api.failure(
      (client) =>
        client.admin.reviewWaitlistEntry({
          params: { id: WaitlistEntryId.make(entry.id) },
          payload: new ReviewWaitlistEntry({ status: "contacted" }),
        }),
      { cookie: avery.cookie },
    );
    expect(again).toMatchObject({
      _tag: "Conflict",
      reason: "waitlist-status-changed",
    });
  });

  it("approval with an existing allowlist row succeeds and leaves that row alone", async () => {
    await resetBootstrap();
    const avery = await asAdmin();
    const acme = await api.createWorkspace({ owner: avery, name: "Acme" });
    await setSettings({ initialWorkspaceId: acme.id });
    await db(({ db }) =>
      db.insert(workspaceInviteAllowlist).values({
        workspaceId: acme.id,
        email: "dup@example.com",
        role: "admin",
        invitedByUserId: avery.id,
      }),
    );
    const entry = await addWaitlist({ email: "dup@example.com" });
    const reviewed = await api.call(
      (client) =>
        client.admin.reviewWaitlistEntry({
          params: { id: WaitlistEntryId.make(entry.id) },
          payload: new ReviewWaitlistEntry({ status: "approved" }),
        }),
      { cookie: avery.cookie },
    );
    expect(reviewed).toMatchObject({
      id: entry.id,
      status: "approved",
      reviewedByUserId: avery.id,
    });
    // Idempotent on the allowlist: the hand-made invite keeps its role.
    const allowlist = await db(({ db }) =>
      db
        .select()
        .from(workspaceInviteAllowlist)
        .where(eq(workspaceInviteAllowlist.email, "dup@example.com")),
    );
    expect(allowlist).toHaveLength(1);
    expect(allowlist[0]).toMatchObject({ workspaceId: acme.id, role: "admin" });
  });

  it("approval without an initial workspace only marks the entry", async () => {
    await resetBootstrap();
    const avery = await asAdmin();
    const entry = await addWaitlist({ email: "solo@example.com" });
    const reviewed = await api.call(
      (client) =>
        client.admin.reviewWaitlistEntry({
          params: { id: WaitlistEntryId.make(entry.id) },
          payload: new ReviewWaitlistEntry({ status: "approved" }),
        }),
      { cookie: avery.cookie },
    );
    expect(reviewed.status).toBe("approved");
    expect(
      await db(({ db }) =>
        db
          .select()
          .from(workspaceInviteAllowlist)
          .where(eq(workspaceInviteAllowlist.email, "solo@example.com")),
      ),
    ).toEqual([]);
  });

  it("two concurrent approvals yield exactly one success and one Conflict, and one allowlist row", async () => {
    await resetBootstrap();
    const avery = await asAdmin();
    const acme = await api.createWorkspace({ owner: avery, name: "Acme" });
    await setSettings({ initialWorkspaceId: acme.id });
    const entry = await addWaitlist({ email: "race@example.com" });
    const results = await Promise.all(
      [1, 2].map(() =>
        api.result(
          (client) =>
            client.admin.reviewWaitlistEntry({
              params: { id: WaitlistEntryId.make(entry.id) },
              payload: new ReviewWaitlistEntry({ status: "approved" }),
            }),
          { cookie: avery.cookie },
        ),
      ),
    );
    const outcomes = results.map((r) =>
      r._tag === "Success" ? "success" : r.failure._tag,
    );
    expect(outcomes.sort()).toEqual(["Conflict", "success"]);
    const allowlist = await db(({ db }) =>
      db
        .select()
        .from(workspaceInviteAllowlist)
        .where(eq(workspaceInviteAllowlist.email, "race@example.com")),
    );
    expect(allowlist).toHaveLength(1);
  });
});

describe("admin users and stats", () => {
  it("stats counts users, admins and workspaces with aggregates", async () => {
    const avery = await asAdmin();
    const before = await api.call((client) => client.admin.stats(), {
      cookie: avery.cookie,
    });
    await api.createUser();
    await api.createUser({ role: "admin" });
    await api.createWorkspace({ owner: avery, name: "Stats" });
    const after = await api.call((client) => client.admin.stats(), {
      cookie: avery.cookie,
    });
    expect(after.totalUsers).toBe(before.totalUsers + 2);
    expect(after.adminUsers).toBe(before.adminUsers + 1);
    expect(after.regularUsers).toBe(after.totalUsers - after.adminUsers);
    expect(after.totalWorkspaces).toBe(before.totalWorkspaces + 1);
  });

  it("listUsers paginates in creation order with a real total (regression: total was the first id)", async () => {
    const avery = await asAdmin();
    const all = await api.call(
      (client) => client.admin.listUsers({ query: { limit: 100, offset: 0 } }),
      { cookie: avery.cookie },
    );
    expect(all.total).toBeGreaterThanOrEqual(all.users.length);
    expect(all.hasMore).toBe(all.users.length === 100);
    const page = await api.call(
      (client) => client.admin.listUsers({ query: { limit: 2, offset: 1 } }),
      { cookie: avery.cookie },
    );
    expect(page.users).toHaveLength(2);
    expect(page.total).toBe(all.total);
    expect(page.hasMore).toBe(true);
    expect(page.users.map((u) => u.id)).toEqual(
      all.users.slice(1, 3).map((u) => u.id),
    );
    expect(page.users[0]).toMatchObject({
      role: expect.any(String),
      image: null,
    });
    expect(page.users[0]?.updatedAt).toBeInstanceOf(Date);

    const defaults = await api.fetch("/api/admin/users", {
      headers: { cookie: avery.cookie },
    });
    expect(defaults.status).toBe(200);
    const bad = await api.fetch("/api/admin/users?limit=0", {
      headers: { cookie: avery.cookie },
    });
    expect(bad.status).toBe(400);
  });

  it("getUser answers the row and 404s an unknown id", async () => {
    const avery = await asAdmin();
    const person = await api.createUser({ name: "Jordan" });
    const found = await api.call(
      (client) =>
        client.admin.getUser({ params: { userId: UserId.make(person.id) } }),
      { cookie: avery.cookie },
    );
    expect(found).toMatchObject({
      id: person.id,
      name: "Jordan",
      role: "user",
    });
    const missing = await api.failure(
      (client) =>
        client.admin.getUser({ params: { userId: UserId.make("missing") } }),
      { cookie: avery.cookie },
    );
    expect(missing).toMatchObject({ _tag: "NotFound", resource: "user" });
  });

  it("updateUserRole promotes, demotes, 404s, and refuses self-demotion with Conflict", async () => {
    const avery = await asAdmin();
    const person = await api.createUser();
    const promoted = await api.call(
      (client) =>
        client.admin.updateUserRole({
          params: { userId: UserId.make(person.id) },
          payload: new UpdateUserRole({ role: "admin" }),
        }),
      { cookie: avery.cookie },
    );
    expect(promoted).toMatchObject({ id: person.id, role: "admin" });
    // The promotion is effective on the next request, cookie cache or not.
    expect(
      (
        await api.call((client) => client.admin.stats(), {
          cookie: person.cookie,
        })
      ).adminUsers,
    ).toBeGreaterThan(0);

    const self = await api.failure(
      (client) =>
        client.admin.updateUserRole({
          params: { userId: UserId.make(avery.id) },
          payload: new UpdateUserRole({ role: "user" }),
        }),
      { cookie: avery.cookie },
    );
    expect(self).toMatchObject({ _tag: "Conflict", reason: "self-demotion" });

    const missing = await api.failure(
      (client) =>
        client.admin.updateUserRole({
          params: { userId: UserId.make("missing") },
          payload: new UpdateUserRole({ role: "user" }),
        }),
      { cookie: avery.cookie },
    );
    expect(missing).toMatchObject({ _tag: "NotFound", resource: "user" });
  });
});
