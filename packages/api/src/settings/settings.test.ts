/**
 * The settings group through the web handler. The `describe`s marked
 * "(ported)" carry the `it()`s ported from the legacy router tests
 * (now deleted), now against a
 * real database instead of a fake `db`.
 */
import type { RequestContextShape } from "@gmacko/auth/request-context";
import { Database } from "@gmacko/db";
import {
  account,
  apiKeys,
  applicationSettings,
  billingPlan,
  billingPlanLimit,
  session,
  usageMeter,
  user,
  userPreferences,
  waitlistEntry,
  workspace,
  workspaceInviteAllowlist,
  workspaceMembership,
  workspaceSubscription,
  workspaceUsageRollup,
} from "@gmacko/db/schema";
import {
  ApiKeyId,
  CreateApiKey,
  CreateInvite,
  InviteId,
  UpdatePreferences,
  WaitlistSubmit,
} from "@gmacko/domain";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeTestApi, type TestApi, type TestUser } from "../testing";
import { toApiKeyCreate, Workspaces } from "./service";

let api: TestApi;
beforeAll(() => {
  api = makeTestApi();
});
afterAll(() => api.dispose());

const db = <A, E>(
  f: (database: Database["Service"]) => Effect.Effect<A, E>,
): Promise<A> => api.run(Effect.flatMap(Database, f));

/** The single application_settings row, replaced wholesale. */
const setSettings = (
  values: Partial<typeof applicationSettings.$inferInsert>,
) =>
  db(({ db }) =>
    Effect.andThen(
      db.delete(applicationSettings),
      db.insert(applicationSettings).values({ ...values }),
    ),
  );

const invite = (
  workspaceId: string,
  email: string,
  role: "admin" | "member",
  invitedBy: TestUser,
  createdAt?: Date,
) => {
  // Without a `createdAt` the column must not be named at all, so the row
  // takes its default; naming it with `undefined` would bind a null.
  const values = {
    workspaceId,
    email,
    role,
    invitedByUserId: invitedBy.id,
  };
  return db(({ db }) =>
    db
      .insert(workspaceInviteAllowlist)
      .values(createdAt === undefined ? values : { ...values, createdAt })
      .returning(),
  ).then((rows) => rows[0]!);
};

describe("settings workspace context (ported)", () => {
  it("prefers initialWorkspaceId when selecting the visible workspace", async () => {
    const avery = await api.createUser({ role: "admin" });
    const atlas = await api.createWorkspace({ owner: avery, name: "Atlas" });
    const beacon = await api.createWorkspace({ owner: avery, name: "Beacon" });
    // Membership in Atlas is older; the initial workspace still wins.
    await db(({ db }) =>
      db
        .update(workspaceMembership)
        .set({ createdAt: new Date("2026-03-27T00:00:00.000Z") })
        .where(eq(workspaceMembership.workspaceId, atlas.id)),
    );
    await setSettings({ initialWorkspaceId: beacon.id });
    await invite(beacon.id, "beta@example.com", "member", avery);
    await invite(beacon.id, "gamma@example.com", "admin", avery);

    const context = await api.call(
      (client) => client.settings.workspaceContext(),
      { cookie: avery.cookie },
    );
    expect(context).toEqual({
      workspace: { id: beacon.id, name: "Beacon", slug: beacon.slug },
      workspaceRole: "owner",
      platformRole: "admin",
      canManageWorkspace: true,
      isPlatformAdmin: true,
      inviteAllowlistCount: 2,
    });
  });

  it("falls back to the earliest membership when no initial workspace is set", async () => {
    await setSettings({ initialWorkspaceId: null });
    const jordan = await api.createUser();
    const atlas = await api.createWorkspace({ owner: jordan, name: "Atlas" });
    await api.createWorkspace({ owner: jordan, name: "Beacon" });
    await db(({ db }) =>
      Effect.andThen(
        db
          .update(workspaceMembership)
          .set({
            role: "member",
            createdAt: new Date("2026-03-27T00:00:00.000Z"),
          })
          .where(eq(workspaceMembership.workspaceId, atlas.id)),
        db.update(user).set({ role: "user" }).where(eq(user.id, jordan.id)),
      ),
    );
    await invite(atlas.id, "alpha@example.com", "member", jordan);

    const context = await api.call(
      (client) => client.settings.workspaceContext(),
      { cookie: jordan.cookie },
    );
    expect(context).toEqual({
      workspace: { id: atlas.id, name: "Atlas", slug: atlas.slug },
      workspaceRole: "member",
      platformRole: "user",
      canManageWorkspace: false,
      isPlatformAdmin: false,
      inviteAllowlistCount: 1,
    });
  });

  it("shows the initial workspace to a non-member with a null role, and nothing to a lone user", async () => {
    const owner = await api.createUser();
    const hq = await api.createWorkspace({ owner, name: "HQ" });
    await setSettings({ initialWorkspaceId: hq.id });
    const outsider = await api.createUser();
    expect(
      await api.call((client) => client.settings.workspaceContext(), {
        cookie: outsider.cookie,
      }),
    ).toMatchObject({
      workspace: { id: hq.id },
      workspaceRole: null,
      canManageWorkspace: false,
    });

    await setSettings({ initialWorkspaceId: null });
    expect(
      await api.call((client) => client.settings.workspaceContext(), {
        cookie: outsider.cookie,
      }),
    ).toMatchObject({
      workspace: null,
      workspaceRole: null,
      inviteAllowlistCount: 0,
    });
  });
});

describe("settings collaboration invites (ported)", () => {
  it("lists pending invites for a manageable current workspace", async () => {
    const avery = await api.createUser({ role: "admin" });
    const atlas = await api.createWorkspace({ owner: avery, name: "Atlas" });
    await setSettings({ initialWorkspaceId: atlas.id });
    const a = await invite(
      atlas.id,
      "alpha@example.com",
      "member",
      avery,
      new Date("2026-03-27T02:00:00.000Z"),
    );
    const b = await invite(
      atlas.id,
      "beta@example.com",
      "admin",
      avery,
      new Date("2026-03-27T03:00:00.000Z"),
    );
    const invites = await api.call((client) => client.settings.listInvites(), {
      cookie: avery.cookie,
    });
    expect(invites.map(({ id, email, role }) => ({ id, email, role }))).toEqual(
      [
        { id: a.id, email: "alpha@example.com", role: "member" },
        { id: b.id, email: "beta@example.com", role: "admin" },
      ],
    );
  });

  it("hides pending invites when the current user cannot manage the workspace (now 403 Forbidden(role))", async () => {
    const owner = await api.createUser();
    const casey = await api.createUser();
    const atlas = await api.createWorkspace({
      owner,
      name: "Atlas",
      members: [{ user: casey, role: "member" }],
    });
    await setSettings({ initialWorkspaceId: atlas.id });
    await invite(atlas.id, "pending@example.com", "member", owner);
    const failure = await api.failure(
      (client) => client.settings.listInvites(),
      { cookie: casey.cookie },
    );
    expect(failure).toMatchObject({ _tag: "Forbidden", reason: "role" });
  });

  it("creates and accepts invite-based collaboration entries", async () => {
    const owner = await api.createUser({ role: "admin" });
    const atlas = await api.createWorkspace({ owner, name: "Atlas" });
    await setSettings({ initialWorkspaceId: atlas.id });
    const invitee = await api.createUser({ email: "Invitee@Example.com" });

    const created = await api.call(
      (client) =>
        client.settings.createInvite({
          payload: new CreateInvite({
            email: "invitee@example.com",
            role: "member",
          }),
        }),
      { cookie: owner.cookie },
    );
    expect(created).toMatchObject({
      workspaceId: atlas.id,
      email: "invitee@example.com",
      role: "member",
      invitedByUserId: owner.id,
    });

    const accepted = await api.call(
      (client) =>
        client.settings.acceptInvite({
          params: { inviteId: created.id },
        }),
      { cookie: invitee.cookie },
    );
    expect(accepted).toEqual({ workspaceId: atlas.id, role: "member" });

    const memberships = await db(({ db }) =>
      db
        .select()
        .from(workspaceMembership)
        .where(eq(workspaceMembership.userId, invitee.id)),
    );
    expect(memberships).toMatchObject([
      { workspaceId: atlas.id, role: "member" },
    ]);
    const remaining = await db(({ db }) =>
      db
        .select()
        .from(workspaceInviteAllowlist)
        .where(eq(workspaceInviteAllowlist.id, created.id)),
    );
    expect(remaining).toEqual([]);
  });

  it("rejects owner invite roles in v1", async () => {
    const owner = await api.createUser();
    const atlas = await api.createWorkspace({ owner, name: "Atlas" });
    await setSettings({ initialWorkspaceId: atlas.id });
    const response = await api.fetch("/api/workspace/invites", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: owner.cookie,
        origin: api.baseUrl,
      },
      body: JSON.stringify({ email: "invitee@example.com", role: "owner" }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects accepting an invite when the account already belongs to another workspace", async () => {
    const owner = await api.createUser();
    const atlas = await api.createWorkspace({ owner, name: "Atlas" });
    const invitee = await api.createUser();
    await api.createWorkspace({
      owner,
      name: "Beacon",
      members: [{ user: invitee, role: "member" }],
    });
    await setSettings({ initialWorkspaceId: atlas.id });
    const pending = await invite(atlas.id, invitee.email, "member", owner);

    const failure = await api.failure(
      (client) =>
        client.settings.acceptInvite({
          params: { inviteId: InviteId.make(pending.id) },
        }),
      { cookie: invitee.cookie },
    );
    expect(failure).toMatchObject({
      _tag: "Conflict",
      reason: "already-in-workspace",
    });
    const memberships = await db(({ db }) =>
      db
        .select()
        .from(workspaceMembership)
        .where(eq(workspaceMembership.workspaceId, atlas.id)),
    );
    expect(memberships.some((m) => m.userId === invitee.id)).toBe(false);
    const stillThere = await db(({ db }) =>
      db
        .select()
        .from(workspaceInviteAllowlist)
        .where(eq(workspaceInviteAllowlist.id, pending.id)),
    );
    expect(stillThere).toHaveLength(1);
  });

  it("answers Conflict(invite-exists) for a duplicate email (case-insensitive)", async () => {
    const owner = await api.createUser();
    const atlas = await api.createWorkspace({ owner, name: "Atlas" });
    await setSettings({ initialWorkspaceId: atlas.id });
    await invite(atlas.id, "dup@example.com", "member", owner);
    const failure = await api.failure(
      (client) =>
        client.settings.createInvite({
          payload: new CreateInvite({
            email: "Dup@Example.com",
            role: "member",
          }),
        }),
      { cookie: owner.cookie },
    );
    expect(failure).toMatchObject({
      _tag: "Conflict",
      reason: "invite-exists",
    });
  });

  it("answers NotFound for an unknown invite and for one addressed to someone else", async () => {
    const owner = await api.createUser();
    const atlas = await api.createWorkspace({ owner, name: "Atlas" });
    await setSettings({ initialWorkspaceId: atlas.id });
    const other = await invite(
      atlas.id,
      "someone@example.com",
      "member",
      owner,
    );
    const stranger = await api.createUser();
    for (const inviteId of ["missing", other.id]) {
      const failure = await api.failure(
        (client) =>
          client.settings.acceptInvite({
            params: { inviteId: InviteId.make(inviteId) },
          }),
        { cookie: stranger.cookie },
      );
      expect(failure).toMatchObject({ _tag: "NotFound", resource: "invite" });
    }
  });

  it("reuses an existing membership and consumes the invite", async () => {
    const owner = await api.createUser();
    const member = await api.createUser();
    const atlas = await api.createWorkspace({
      owner,
      name: "Atlas",
      members: [{ user: member, role: "admin" }],
    });
    await setSettings({ initialWorkspaceId: atlas.id });
    const pending = await invite(atlas.id, member.email, "member", owner);
    const accepted = await api.call(
      (client) =>
        client.settings.acceptInvite({
          params: { inviteId: InviteId.make(pending.id) },
        }),
      { cookie: member.cookie },
    );
    expect(accepted).toEqual({ workspaceId: atlas.id, role: "admin" });
  });

  it("acceptInvite's membership insert is idempotent: a membership that landed after the caller's memberships were read is left alone", async () => {
    const owner = await api.createUser();
    const atlas = await api.createWorkspace({ owner, name: "Atlas" });
    await setSettings({ initialWorkspaceId: atlas.id });
    const invitee = await api.createUser();
    const pending = await invite(atlas.id, invitee.email, "member", owner);
    // The race, replayed deterministically: the request read no
    // memberships, then a concurrent accept inserted one before this
    // call's batch ran.
    await db(({ db }) =>
      db.insert(workspaceMembership).values({
        workspaceId: atlas.id,
        userId: invitee.id,
        role: "admin",
      }),
    );
    // A request context whose memberships are stale: the row was inserted
    // after it was built. `acceptInvite` reads only `memberships`; every
    // other read dies loudly rather than answering with a plausible value.
    const unread = (name: string) =>
      Effect.die(new Error(`stale request context: ${name} must not be read`));
    const stale: RequestContextShape = {
      session: unread("session"),
      user: () => unread("user"),
      role: () => unread("role"),
      memberships: () => Effect.succeed([]),
      workspace: () => unread("workspace"),
    };
    const accepted = await api.run(
      Effect.flatMap(Workspaces, (workspaces) =>
        workspaces.acceptInvite(
          { id: invitee.id, email: invitee.email },
          InviteId.make(pending.id),
          stale,
        ),
      ).pipe(Effect.provide(Workspaces.layer)),
    );
    expect(accepted).toEqual({ workspaceId: atlas.id, role: "member" });
    const memberships = await db(({ db }) =>
      db
        .select()
        .from(workspaceMembership)
        .where(eq(workspaceMembership.userId, invitee.id)),
    );
    expect(memberships).toMatchObject([
      { workspaceId: atlas.id, role: "admin" },
    ]);
    expect(
      await db(({ db }) =>
        db
          .select()
          .from(workspaceInviteAllowlist)
          .where(eq(workspaceInviteAllowlist.id, pending.id)),
      ),
    ).toEqual([]);
  });

  it("leaves no partial rows when the batch's last statement fails", async () => {
    const owner = await api.createUser();
    const atlas = await api.createWorkspace({ owner, name: "Atlas" });
    await setSettings({ initialWorkspaceId: atlas.id });
    const invitee = await api.createUser();
    const pending = await invite(atlas.id, invitee.email, "member", owner);
    // Make the invite row un-deletable for this one call: a trigger that
    // aborts the delete, so the batch's last statement fails after the
    // membership insert succeeded inside the same transaction.
    await db(({ sql }) =>
      sql`create trigger block_invite_delete before delete on workspace_invite_allowlist begin select raise(abort, 'blocked'); end`.pipe(
        Effect.orDie,
      ),
    );
    try {
      const failure = await api.failure(
        (client) =>
          client.settings.acceptInvite({
            params: { inviteId: InviteId.make(pending.id) },
          }),
        { cookie: invitee.cookie },
      );
      expect(failure).toMatchObject({ _tag: "InternalError" });
    } finally {
      await db(({ sql }) =>
        sql`drop trigger block_invite_delete`.pipe(Effect.orDie),
      );
    }
    const memberships = await db(({ db }) =>
      db
        .select()
        .from(workspaceMembership)
        .where(eq(workspaceMembership.userId, invitee.id)),
    );
    expect(memberships).toEqual([]);
  });
});

describe("settings billing overview (ported)", () => {
  const seedPlan = (values: typeof billingPlan.$inferInsert) =>
    db(({ db }) => db.insert(billingPlan).values(values).returning()).then(
      (rows) => rows[0]!,
    );

  it("keeps billing and usage hidden when the SaaS billing layers are disabled", async () => {
    const hidden = makeTestApi({
      features: { billing: false, metering: false },
    });
    try {
      const owner = await hidden.createUser();
      const acme = await hidden.createWorkspace({ owner, name: "Acme" });
      await hidden.run(
        Effect.flatMap(Database, ({ db }) =>
          Effect.andThen(
            db
              .insert(applicationSettings)
              .values({ initialWorkspaceId: acme.id }),
            db.insert(billingPlan).values({
              key: "free",
              name: "Free",
              amountInCents: 0,
              isDefault: true,
            }),
          ),
        ),
      );
      const overview = await hidden.call(
        (client) => client.settings.billingOverview(),
        { cookie: owner.cookie },
      );
      expect(overview.billing.visible).toBe(false);
      expect(overview.usage.visible).toBe(false);
      // The read model is still computed (the default plan is selected).
      expect(overview.billing.plan?.key).toBe("free");
    } finally {
      await hidden.dispose();
    }
  });

  it("shows billing and usage when the corresponding SaaS features are enabled", async () => {
    const shown = makeTestApi({ features: { billing: true, metering: true } });
    try {
      const owner = await shown.createUser();
      const acme = await shown.createWorkspace({ owner, name: "Acme" });
      const periodStart = new Date("2026-03-01T00:00:00.000Z");
      const periodEnd = new Date("2026-04-01T00:00:00.000Z");
      await shown.run(
        Effect.flatMap(Database, ({ db }) =>
          Effect.gen(function* () {
            yield* db
              .insert(applicationSettings)
              .values({ initialWorkspaceId: acme.id });
            const [pro] = yield* db
              .insert(billingPlan)
              .values({
                key: "pro",
                name: "Pro",
                description: "Expanded limits",
                amountInCents: 4900,
                isDefault: false,
              })
              .returning();
            yield* db.insert(billingPlanLimit).values({
              planId: pro!.id,
              key: "api_calls",
              value: 1000,
              period: "month",
            });
            yield* db.insert(workspaceSubscription).values({
              workspaceId: acme.id,
              planId: pro!.id,
              status: "active",
              provider: "manual",
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            });
            const [meter] = yield* db
              .insert(usageMeter)
              .values({ key: "api_calls", name: "API Calls", unit: "calls" })
              .returning();
            yield* db.insert(workspaceUsageRollup).values({
              workspaceId: acme.id,
              meterId: meter!.id,
              periodStart,
              periodEnd,
              quantity: 250,
            });
          }),
        ),
      );
      const overview = await shown.call(
        (client) => client.settings.billingOverview(),
        { cookie: owner.cookie },
      );
      expect(overview.billing.visible).toBe(true);
      expect(overview.billing.plan?.key).toBe("pro");
      expect(overview.billing.subscription).toEqual({
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
        currentPeriodStart: periodStart,
        provider: "manual",
        status: "active",
      });
      expect(overview.usage.visible).toBe(true);
      expect(overview.usage.limits).toEqual([
        { currentUsage: 250, key: "api_calls", period: "month", value: 1000 },
      ]);
      expect(overview.usage.meters).toEqual([
        {
          aggregation: "sum",
          currentUsage: 250,
          key: "api_calls",
          latestPeriodEnd: periodEnd,
          latestPeriodStart: periodStart,
          name: "API Calls",
          unit: "calls",
        },
      ]);
      expect(overview.usage.currentPeriodStart).toEqual(periodStart);
    } finally {
      await shown.dispose();
    }
  });

  it("is empty without a current workspace, and defaults the period to the UTC month", async () => {
    await setSettings({ initialWorkspaceId: null });
    const lonely = await api.createUser();
    const empty = await api.call(
      (client) => client.settings.billingOverview(),
      {
        cookie: lonely.cookie,
      },
    );
    expect(empty).toEqual({
      billing: {
        customerPortalAvailable: false,
        plan: null,
        plans: [],
        providerConfigured: false,
        subscription: null,
        visible: false,
      },
      usage: {
        currentPeriodEnd: null,
        currentPeriodStart: null,
        limits: [],
        meters: [],
        visible: false,
      },
    });

    const acme = await api.createWorkspace({ owner: lonely, name: "Acme" });
    await setSettings({ initialWorkspaceId: acme.id });
    await seedPlan({
      key: `basic-${acme.id}`,
      name: "Basic",
      amountInCents: 100,
    });
    const overview = await api.call(
      (client) => client.settings.billingOverview(),
      { cookie: lonely.cookie },
    );
    const now = new Date();
    expect(overview.usage.currentPeriodStart).toEqual(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    );
    expect(overview.usage.currentPeriodEnd).toEqual(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    );
    expect(overview.billing.subscription).toBeNull();
  });

  it("exposes shared platform primitives for workspace surfaces", async () => {
    const person = await api.createUser();
    const primitives = await api.call(
      (client) => client.settings.platformPrimitives(),
      { cookie: person.cookie },
    );
    expect(primitives).toMatchObject({
      featureFlags: { enabled: true, provider: "local" },
      jobs: { enabled: true, provider: "local" },
      rateLimits: expect.objectContaining({
        enabled: true,
        scopes: expect.arrayContaining(["auth", "contact", "operator-api"]),
      }),
      botProtection: { enabled: true, provider: "local-rate-limit" },
      compliance: { dataDeletion: true, dataExport: true, enabled: true },
      emailDelivery: { enabled: false, provider: "none" },
    });
  });
});

describe("settings launch state and waitlist", () => {
  it("launchState is public and falls back to the defaults", async () => {
    await db(({ db }) => db.delete(applicationSettings));
    const state = await api.call((client) => client.settings.launchState());
    expect(state).toEqual({
      announcementMessage: null,
      announcementTone: "info",
      allowedEmailDomains: [],
      canAutoCreateAccounts: true,
      inviteOnly: false,
      maintenanceMode: false,
      signupEnabled: true,
      stripeConfigured: false,
      publicAnnouncementVisible: false,
      canUseWaitlist: true,
    });
  });

  it("launchState reflects the settings row, maps an unknown tone to info, and disables auto-create outside development", async () => {
    await setSettings({
      maintenanceMode: true,
      signupEnabled: false,
      announcementMessage: "Down for a bit",
      announcementTone: "bogus",
      allowedEmailDomains: ["example.com"],
    });
    const state = await api.call((client) => client.settings.launchState());
    expect(state).toMatchObject({
      maintenanceMode: true,
      signupEnabled: false,
      inviteOnly: true,
      announcementMessage: "Down for a bit",
      announcementTone: "info",
      allowedEmailDomains: ["example.com"],
      publicAnnouncementVisible: true,
    });

    const production = makeTestApi({ stage: "production" });
    try {
      const prod = await production.call((client) =>
        client.settings.launchState(),
      );
      expect(prod.canAutoCreateAccounts).toBe(false);
    } finally {
      await production.dispose();
    }
  });

  it("submitWaitlistEntry upserts on (email, source) and never resets a reviewed status", async () => {
    const first = await api.call((client) =>
      client.settings.submitWaitlistEntry({
        payload: new WaitlistSubmit({
          email: "Wait@Example.com",
          message: "hi",
          source: "landing",
        }),
      }),
    );
    expect(first).toMatchObject({
      email: "wait@example.com",
      source: "landing",
      status: "pending",
    });

    const again = await api.call((client) =>
      client.settings.submitWaitlistEntry({
        payload: new WaitlistSubmit({
          email: "wait@example.com",
          message: "updated",
          referralCode: "ref-1",
          source: "landing",
        }),
      }),
    );
    expect(again.id).toBe(first.id);

    await db(({ db }) =>
      db
        .update(waitlistEntry)
        .set({ status: "approved" })
        .where(eq(waitlistEntry.id, first.id)),
    );
    const third = await api.call((client) =>
      client.settings.submitWaitlistEntry({
        payload: new WaitlistSubmit({
          email: "wait@example.com",
          message: "third",
          source: "landing",
        }),
      }),
    );
    expect(third).toMatchObject({ id: first.id, status: "approved" });
    const [row] = await db(({ db }) =>
      db.select().from(waitlistEntry).where(eq(waitlistEntry.id, first.id)),
    );
    expect(row).toMatchObject({ message: "third", referralCode: null });

    const contact = await api.call((client) =>
      client.settings.submitWaitlistEntry({
        payload: new WaitlistSubmit({
          email: "wait@example.com",
          source: "contact",
        }),
      }),
    );
    expect(contact.id).not.toBe(first.id);
    expect(contact.status).toBe("pending");
  });

  it("defaults the source to landing and rejects a bad email with 400", async () => {
    const created = await api.fetch("/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "default@example.com" }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ source: "landing" });

    const bad = await api.fetch("/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(bad.status).toBe(400);
  });
});

describe("settings preferences", () => {
  it("getPreferences returns the defaults without inserting a row", async () => {
    const person = await api.createUser();
    const prefs = await api.call((client) => client.settings.getPreferences(), {
      cookie: person.cookie,
    });
    expect(prefs).toMatchObject({
      userId: person.id,
      theme: "system",
      language: "en",
      timezone: "UTC",
      emailNotifications: true,
      pushNotifications: true,
    });
    // Honest about being unsaved: no sentinel id or epoch date.
    expect(prefs.id).toBeNull();
    expect(prefs.createdAt).toBeNull();
    expect(prefs.updatedAt).toBeNull();
    const rows = await db(({ db }) =>
      db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, person.id)),
    );
    expect(rows).toEqual([]);
  });

  it("updatePreferences upserts and touches only the fields sent", async () => {
    const person = await api.createUser();
    const first = await api.call(
      (client) =>
        client.settings.updatePreferences({
          payload: new UpdatePreferences({ theme: "dark" }),
        }),
      { cookie: person.cookie },
    );
    expect(first).toMatchObject({
      theme: "dark",
      language: "en",
      timezone: "UTC",
    });
    expect(first.id).toEqual(expect.any(String));
    expect(first.createdAt).toBeInstanceOf(Date);

    const second = await api.call(
      (client) =>
        client.settings.updatePreferences({
          payload: new UpdatePreferences({ emailNotifications: false }),
        }),
      { cookie: person.cookie },
    );
    // Regression: the zod version reset theme/language/timezone here.
    expect(second).toMatchObject({
      theme: "dark",
      emailNotifications: false,
      pushNotifications: true,
    });
    expect(second.id).toBe(first.id);

    const rows = await db(({ db }) =>
      db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, person.id)),
    );
    expect(rows).toHaveLength(1);
  });

  it("maps an unknown stored theme to system on read and rejects one on write", async () => {
    const person = await api.createUser();
    await db(({ db }) =>
      db.insert(userPreferences).values({ userId: person.id, theme: "sepia" }),
    );
    const prefs = await api.call((client) => client.settings.getPreferences(), {
      cookie: person.cookie,
    });
    expect(prefs.theme).toBe("system");

    const bad = await api.fetch("/api/preferences", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: person.cookie,
        origin: api.baseUrl,
      },
      body: JSON.stringify({ theme: "sepia" }),
    });
    expect(bad.status).toBe(400);
  });
});

describe("settings api keys", () => {
  it("toApiKeyCreate turns expiresInDays into the expiresAt instant, or leaves a key that never expires without one", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(
      toApiKeyCreate(
        new CreateApiKey({
          name: "ci",
          permissions: ["read"],
          expiresInDays: 30,
        }),
        now,
      ),
    ).toEqual({
      name: "ci",
      permissions: ["read"],
      expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
    });
    expect(
      toApiKeyCreate(
        new CreateApiKey({ name: "ci", permissions: ["read"] }),
        now,
      ).expiresAt,
    ).toBeUndefined();
  });

  it("creates a key once with its secret, lists it, and revokes it", async () => {
    const person = await api.createUser();
    const created = await api.call(
      (client) =>
        client.settings.createApiKey({
          payload: new CreateApiKey({
            name: "CI",
            permissions: ["read", "write"],
            expiresInDays: 30,
          }),
        }),
      { cookie: person.cookie },
    );
    expect(created.key.startsWith("gmk_")).toBe(true);
    expect(created.keyPrefix).toBe(created.key.slice(0, 12));
    expect(created.permissions).toEqual(["read", "write"]);
    expect(created.expiresAt?.getTime()).toBeGreaterThan(Date.now());

    const listed = await api.call((client) => client.settings.listApiKeys(), {
      cookie: person.cookie,
    });
    expect(listed.map((key) => key.id)).toEqual([created.id]);
    expect(listed[0]).not.toHaveProperty("key");

    const response = await api.fetch(`/api/api-keys/${created.id}`, {
      method: "DELETE",
      headers: { cookie: person.cookie, origin: api.baseUrl },
    });
    expect(response.status).toBe(204);
    expect(
      await api.call((client) => client.settings.listApiKeys(), {
        cookie: person.cookie,
      }),
    ).toEqual([]);
    expect(
      await api.failure(
        (client) =>
          client.settings.revokeApiKey({ params: { id: created.id } }),
        { cookie: person.cookie },
      ),
    ).toMatchObject({ _tag: "NotFound", resource: "apiKey" });
  });

  it("key management takes the admin scope; someone else's key is NotFound", async () => {
    const person = await api.createUser();
    const other = await api.createUser();
    const theirs = await api.createApiKey(other, ["read"]);
    const readKey = await api.createApiKey(person, ["read"]);
    const adminKey = await api.createApiKey(person, ["admin"]);

    const scoped = await api.failure(
      (client) =>
        client.settings.createApiKey({
          payload: new CreateApiKey({ name: "nope", permissions: ["read"] }),
        }),
      { bearer: readKey.key },
    );
    expect(scoped).toMatchObject({ _tag: "Forbidden", reason: "scope" });

    const minted = await api.call(
      (client) =>
        client.settings.createApiKey({
          payload: new CreateApiKey({ name: "via-key", permissions: ["read"] }),
        }),
      { bearer: adminKey.key },
    );
    expect(minted.name).toBe("via-key");

    const notMine = await api.failure(
      (client) =>
        client.settings.revokeApiKey({
          params: { id: ApiKeyId.make(theirs.id) },
        }),
      { cookie: person.cookie },
    );
    expect(notMine).toMatchObject({ _tag: "NotFound" });
  });
});

describe("settings deleteAccount", () => {
  it("deletes the user row and cascades sessions, accounts, keys, preferences and memberships", async () => {
    const person = await api.createUser();
    await api.createApiKey(person, ["read"]);
    const acme = await api.createWorkspace({ owner: person, name: "Mine" });
    await api.call(
      (client) =>
        client.settings.updatePreferences({
          payload: new UpdatePreferences({ theme: "light" }),
        }),
      { cookie: person.cookie },
    );
    await db(({ db }) =>
      db.insert(account).values({
        id: crypto.randomUUID(),
        issuer: "test",
        accountId: person.id,
        providerId: "magic-link",
        userId: person.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const response = await api.fetch("/api/account", {
      method: "DELETE",
      headers: { cookie: person.cookie, origin: api.baseUrl },
    });
    expect(response.status).toBe(204);

    const counts = await db(({ db }) =>
      Effect.all({
        users: db.select().from(user).where(eq(user.id, person.id)),
        sessions: db
          .select()
          .from(session)
          .where(eq(session.userId, person.id)),
        accounts: db
          .select()
          .from(account)
          .where(eq(account.userId, person.id)),
        keys: db.select().from(apiKeys).where(eq(apiKeys.userId, person.id)),
        prefs: db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, person.id)),
        memberships: db
          .select()
          .from(workspaceMembership)
          .where(eq(workspaceMembership.userId, person.id)),
        // The owner's workspace cascades too (documented in API_AUTH.md).
        workspaces: db
          .select()
          .from(workspace)
          .where(eq(workspace.id, acme.id)),
      }),
    );
    expect(
      Object.fromEntries(
        Object.entries(counts).map(([key, rows]) => [key, rows.length]),
      ),
    ).toEqual({
      users: 0,
      sessions: 0,
      accounts: 0,
      keys: 0,
      prefs: 0,
      memberships: 0,
      workspaces: 0,
    });

    // The response expires both auth cookies, so the browser stops sending
    // them (the app is served over http here; over https the names carry
    // the `__Secure-` prefix, which better-auth's sign-out applies itself).
    const expired = response.headers
      .getSetCookie()
      .filter((value) => /;\s*max-age=0(;|$)/i.test(value))
      .map((value) => value.split("=")[0]);
    expect(expired).toEqual(
      expect.arrayContaining([
        "better-auth.session_token",
        "better-auth.session_data",
      ]),
    );

    // And the dead session no longer authenticates even when the browser
    // does send the old cookies, signed cookie cache (`session_data`)
    // included: `RequestContext.session` checks the cache against the user
    // row (see packages/auth/src/index.ts), which is gone.
    expect(person.cookie).toContain("better-auth.session_data=");
    const failure = await api.failure(
      (client) => client.settings.getPreferences(),
      { cookie: person.cookie },
    );
    expect(failure).toMatchObject({ _tag: "Unauthorized" });
  });

  it("is session only: a bearer key, even admin, is Forbidden(scope)", async () => {
    const person = await api.createUser();
    const adminKey = await api.createApiKey(person, ["admin"]);
    const response = await api.fetch("/api/account", {
      method: "DELETE",
      headers: { authorization: `Bearer ${adminKey.key}` },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      _tag: "Forbidden",
      reason: "scope",
    });
  });
});
