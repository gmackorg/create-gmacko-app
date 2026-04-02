import { randomUUID } from "node:crypto";
import { saasFeatures } from "@gmacko/config";
import {
  applicationSettings,
  user,
  workspace,
  workspaceInviteAllowlist,
  workspaceMembership,
} from "@gmacko/db/schema";
import { describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/gmacko_test";

const { appRouter } = await import("../../root");

type TestUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
};

type TestWorkspace = {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date | null;
};

type TestApplicationSettings = {
  id: string;
  setupCompletedAt: Date | null;
  setupCompletedByUserId: string | null;
  initialWorkspaceId: string | null;
  tenancyMode?: "single-tenant" | "multi-tenant";
  createdAt: Date;
  updatedAt: Date | null;
};

type TestWorkspaceMembership = {
  id: string;
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  createdAt: Date;
  updatedAt: Date | null;
};

type TestAllowlistEntry = {
  id: string;
  workspaceId: string;
  email: string;
  role: "admin" | "member";
  invitedByUserId: string;
  createdAt: Date;
  updatedAt: Date | null;
};

type TestBillingPlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  interval: "month" | "year";
  amountInCents: number;
  currency: string;
  isDefault: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date | null;
};

type TestBillingPlanLimit = {
  id: string;
  planId: string;
  key: string;
  value: number | null;
  period: "day" | "month" | "all_time";
  createdAt: Date;
  updatedAt: Date | null;
};

type TestWorkspaceSubscription = {
  id: string;
  workspaceId: string;
  planId: string | null;
  status:
    | "free"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "incomplete";
  provider: "manual" | "stripe";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date | null;
};

type TestUsageMeter = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  aggregation: "sum" | "max";
  unit: string;
  createdAt: Date;
  updatedAt: Date | null;
};

type TestWorkspaceUsageRollup = {
  id: string;
  workspaceId: string;
  meterId: string;
  periodStart: Date;
  periodEnd: Date;
  quantity: number;
  createdAt: Date;
  updatedAt: Date | null;
};

function createCaller(options?: {
  sessionUser?: TestUser;
  applicationSettings?: TestApplicationSettings | null;
  workspaces?: TestWorkspace[];
  memberships?: TestWorkspaceMembership[];
  allowlistEntries?: TestAllowlistEntry[];
  billingPlans?: TestBillingPlan[];
  billingPlanLimits?: TestBillingPlanLimit[];
  subscriptions?: TestWorkspaceSubscription[];
  usageMeters?: TestUsageMeter[];
  usageRollups?: TestWorkspaceUsageRollup[];
  headers?: Record<string, string>;
  tenancyMode?: "single-tenant" | "multi-tenant";
}) {
  const state = {
    user: options?.sessionUser ?? {
      id: "user_1",
      name: "Taylor",
      email: "taylor@example.com",
      emailVerified: true,
      image: null,
      role: "user" as const,
      createdAt: new Date("2026-03-27T00:00:00.000Z"),
      updatedAt: new Date("2026-03-27T00:00:00.000Z"),
    },
    applicationSettings: options?.applicationSettings ?? null,
    workspaces: [...(options?.workspaces ?? [])],
    memberships: [...(options?.memberships ?? [])],
    allowlistEntries: [...(options?.allowlistEntries ?? [])],
    billingPlans: [...(options?.billingPlans ?? [])],
    billingPlanLimits: [...(options?.billingPlanLimits ?? [])],
    subscriptions: [...(options?.subscriptions ?? [])],
    usageMeters: [...(options?.usageMeters ?? [])],
    usageRollups: [...(options?.usageRollups ?? [])],
    selectedWorkspaceId: null as string | null,
    selectedInviteId: null as string | null,
  };

  const headers = new Headers(options?.headers);

  const sortMemberships = () =>
    [...state.memberships].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );

  const sortWorkspaces = () =>
    [...state.workspaces].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );

  const getActiveWorkspaceId = () =>
    state.selectedWorkspaceId ??
    headers.get("x-gmacko-workspace-id") ??
    state.applicationSettings?.initialWorkspaceId ??
    sortMemberships()[0]?.workspaceId ??
    null;

  const makeRowsQuery = <T>(rows: T[]) => {
    const query = {
      where: () => query,
      limit: () => query,
      offset: () => query,
      orderBy: () => query,
      then: (
        onFulfilled?: ((value: T[]) => unknown) | null,
        onRejected?: ((reason: unknown) => unknown) | null,
      ) => Promise.resolve(rows).then(onFulfilled, onRejected),
    };

    return query;
  };

  const db = {
    execute: vi.fn(async () => undefined),
    query: {
      applicationSettings: {
        findFirst: vi.fn(async () => state.applicationSettings),
      },
      workspaceMembership: {
        findFirst: vi.fn(async () => {
          const preferredWorkspaceId =
            state.applicationSettings?.initialWorkspaceId ?? null;

          const membership = preferredWorkspaceId
            ? (state.memberships.find(
                (entry) =>
                  entry.userId === state.user.id &&
                  entry.workspaceId === preferredWorkspaceId,
              ) ?? null)
            : (sortMemberships().find(
                (entry) => entry.userId === state.user.id,
              ) ?? null);

          state.selectedWorkspaceId =
            membership?.workspaceId ??
            state.applicationSettings?.initialWorkspaceId ??
            null;

          return membership;
        }),
        findMany: vi.fn(async () =>
          sortMemberships().filter((entry) => entry.userId === state.user.id),
        ),
      },
      workspace: {
        findFirst: vi.fn(async () => {
          const workspaceId =
            getActiveWorkspaceId() ?? sortWorkspaces()[0]?.id ?? null;

          const row = workspaceId
            ? (state.workspaces.find((entry) => entry.id === workspaceId) ??
              null)
            : null;

          if (row) {
            state.selectedWorkspaceId = row.id;
          }

          return row;
        }),
        findMany: vi.fn(async () => sortWorkspaces()),
      },
      workspaceInviteAllowlist: {
        findFirst: vi.fn(async ({ where }: { where?: unknown } = {}) => {
          void where;
          const row =
            state.allowlistEntries.find(
              (entry) =>
                entry.workspaceId === getActiveWorkspaceId() ||
                entry.id === getActiveWorkspaceId(),
            ) ?? null;

          state.selectedInviteId = row?.id ?? null;
          return row;
        }),
        findMany: vi.fn(async () =>
          [...state.allowlistEntries].sort(
            (a, b) =>
              a.createdAt.getTime() - b.createdAt.getTime() ||
              a.id.localeCompare(b.id),
          ),
        ),
      },
      billingPlan: {
        findMany: vi.fn(async () => [...state.billingPlans]),
      },
      billingPlanLimit: {
        findMany: vi.fn(async () => [...state.billingPlanLimits]),
      },
      workspaceSubscription: {
        findFirst: vi.fn(
          async () =>
            state.subscriptions.find(
              (entry) => entry.workspaceId === getActiveWorkspaceId(),
            ) ?? null,
        ),
      },
      usageMeter: {
        findMany: vi.fn(async () => [...state.usageMeters]),
      },
      workspaceUsageRollup: {
        findMany: vi.fn(async () =>
          [...state.usageRollups].filter(
            (entry) => entry.workspaceId === getActiveWorkspaceId(),
          ),
        ),
      },
    },
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        ...(() => {
          if (table === user) {
            return makeRowsQuery([state.user]);
          }

          throw new Error("Unexpected select table");
        })(),
      }),
    })),
    update: vi.fn(() => {
      throw new Error("Unexpected update");
    }),
    insert: vi.fn((table: unknown) => {
      if (table === workspaceInviteAllowlist) {
        return {
          values: (values: Partial<TestAllowlistEntry>) => ({
            returning: async () => {
              const row: TestAllowlistEntry = {
                id: values.id ?? randomUUID(),
                workspaceId: values.workspaceId ?? getActiveWorkspaceId()!,
                email: values.email ?? "invitee@example.com",
                role: values.role ?? "member",
                invitedByUserId: values.invitedByUserId ?? state.user.id,
                createdAt:
                  values.createdAt ?? new Date("2026-03-27T03:00:00.000Z"),
                updatedAt: values.updatedAt ?? null,
              };

              state.allowlistEntries.push(row);
              return [row];
            },
          }),
        };
      }

      if (table === workspaceMembership) {
        return {
          values: (values: Partial<TestWorkspaceMembership>) => ({
            returning: async () => {
              const row: TestWorkspaceMembership = {
                id: values.id ?? randomUUID(),
                workspaceId: values.workspaceId ?? getActiveWorkspaceId()!,
                userId: values.userId ?? state.user.id,
                role: values.role ?? "member",
                createdAt:
                  values.createdAt ?? new Date("2026-03-27T03:00:00.000Z"),
                updatedAt: values.updatedAt ?? null,
              };

              state.memberships.push(row);
              return [row];
            },
          }),
        };
      }

      throw new Error("Unexpected insert");
    }),
    delete: vi.fn((table: unknown) => {
      if (table === workspaceInviteAllowlist) {
        return {
          where: () => ({
            returning: async () => {
              const index = state.allowlistEntries.findIndex(
                (entry) =>
                  entry.id === state.selectedInviteId ||
                  entry.email.toLowerCase() === state.user.email.toLowerCase(),
              );
              if (index === -1) {
                return [];
              }

              const [deleted] = state.allowlistEntries.splice(index, 1);
              state.selectedInviteId = null;
              return deleted ? [{ id: deleted.id }] : [];
            },
          }),
        };
      }

      throw new Error("Unexpected delete");
    }),
    transaction: vi.fn(async (fn: (tx: typeof db) => Promise<unknown>) =>
      fn(db),
    ),
  };

  const caller = appRouter.createCaller({
    db: db as never,
    headers,
    tenancyMode: options?.tenancyMode ?? "single-tenant",
    session: {
      user: state.user,
      session: null,
    },
    apiKeyAuth: null,
    authApi: {
      getSession: vi.fn(async () => ({
        user: state.user,
        session: null,
      })),
    },
  } as never);

  return { caller, db, state };
}

describe("settings workspace context", () => {
  it("applies database session context before resolving tenant-scoped workspace state", async () => {
    const { caller, db } = createCaller({
      tenancyMode: "multi-tenant",
      workspaces: [
        {
          id: "workspace_1",
          name: "Acme",
          slug: "acme",
          ownerUserId: "user_1",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: "membership_1",
          workspaceId: "workspace_1",
          userId: "user_1",
          role: "owner",
          createdAt: new Date("2026-03-27T01:10:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    await (
      caller.settings as { getWorkspaceContext: () => Promise<unknown> }
    ).getWorkspaceContext();

    expect(db.transaction).toHaveBeenCalled();
    expect(db.execute).toHaveBeenCalled();
  });

  it("prefers initialWorkspaceId when selecting the visible workspace", async () => {
    const { caller } = createCaller({
      sessionUser: {
        id: "admin_1",
        name: "Avery",
        email: "avery@example.com",
        emailVerified: true,
        image: null,
        role: "admin",
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
        updatedAt: new Date("2026-03-27T00:00:00.000Z"),
      },
      applicationSettings: {
        id: randomUUID(),
        setupCompletedAt: new Date("2026-03-27T01:00:00.000Z"),
        setupCompletedByUserId: "admin_1",
        initialWorkspaceId: "workspace_2",
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
        updatedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Atlas",
          slug: "atlas",
          ownerUserId: "admin_1",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
        {
          id: "workspace_2",
          name: "Beacon",
          slug: "beacon",
          ownerUserId: "admin_1",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: "membership_1",
          workspaceId: "workspace_1",
          userId: "admin_1",
          role: "member",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
        {
          id: "membership_2",
          workspaceId: "workspace_2",
          userId: "admin_1",
          role: "owner",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      allowlistEntries: [
        {
          id: randomUUID(),
          workspaceId: "workspace_2",
          email: "beta@example.com",
          role: "member",
          invitedByUserId: "admin_1",
          createdAt: new Date("2026-03-27T02:00:00.000Z"),
          updatedAt: null,
        },
        {
          id: randomUUID(),
          workspaceId: "workspace_2",
          email: "gamma@example.com",
          role: "admin",
          invitedByUserId: "admin_1",
          createdAt: new Date("2026-03-27T02:30:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    const settingsCaller = caller.settings as unknown as {
      getWorkspaceContext: () => Promise<{
        workspace: { id: string; name: string; slug: string } | null;
        availableWorkspaces: Array<{ id: string; name: string; slug: string }>;
        workspaceRole: "owner" | "admin" | "member" | null;
        platformRole: "user" | "admin";
        canManageWorkspace: boolean;
        isPlatformAdmin: boolean;
        inviteAllowlistCount: number;
        requiresWorkspaceSelection: boolean;
        workspaceSelectionSource: string;
      }>;
    };

    await expect(settingsCaller.getWorkspaceContext()).resolves.toEqual({
      availableWorkspaces: [
        {
          id: "workspace_1",
          name: "Atlas",
          slug: "atlas",
        },
        {
          id: "workspace_2",
          name: "Beacon",
          slug: "beacon",
        },
      ],
      workspace: {
        id: "workspace_2",
        name: "Beacon",
        slug: "beacon",
      },
      workspaceRole: "owner",
      platformRole: "admin",
      canManageWorkspace: true,
      isPlatformAdmin: true,
      inviteAllowlistCount: 2,
      requiresWorkspaceSelection: false,
      workspaceSelectionSource: "default",
    });
  });

  it("falls back to the earliest membership when no initial workspace is set", async () => {
    const { caller } = createCaller({
      sessionUser: {
        id: "user_2",
        name: "Jordan",
        email: "jordan@example.com",
        emailVerified: true,
        image: null,
        role: "user",
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
        updatedAt: new Date("2026-03-27T00:00:00.000Z"),
      },
      applicationSettings: {
        id: randomUUID(),
        setupCompletedAt: new Date("2026-03-27T01:00:00.000Z"),
        setupCompletedByUserId: "admin_1",
        initialWorkspaceId: null,
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
        updatedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Atlas",
          slug: "atlas",
          ownerUserId: "user_2",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
        {
          id: "workspace_2",
          name: "Beacon",
          slug: "beacon",
          ownerUserId: "user_2",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: "membership_1",
          workspaceId: "workspace_1",
          userId: "user_2",
          role: "member",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
        {
          id: "membership_2",
          workspaceId: "workspace_2",
          userId: "user_2",
          role: "owner",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      allowlistEntries: [
        {
          id: randomUUID(),
          workspaceId: "workspace_1",
          email: "alpha@example.com",
          role: "member",
          invitedByUserId: "user_2",
          createdAt: new Date("2026-03-27T02:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    const settingsCaller = caller.settings as unknown as {
      getWorkspaceContext: () => Promise<{
        workspace: { id: string; name: string; slug: string } | null;
        availableWorkspaces: Array<{ id: string; name: string; slug: string }>;
        workspaceRole: "owner" | "admin" | "member" | null;
        platformRole: "user" | "admin";
        canManageWorkspace: boolean;
        isPlatformAdmin: boolean;
        inviteAllowlistCount: number;
        requiresWorkspaceSelection: boolean;
        workspaceSelectionSource: string;
      }>;
    };

    await expect(settingsCaller.getWorkspaceContext()).resolves.toEqual({
      availableWorkspaces: [
        {
          id: "workspace_1",
          name: "Atlas",
          slug: "atlas",
        },
        {
          id: "workspace_2",
          name: "Beacon",
          slug: "beacon",
        },
      ],
      workspace: {
        id: "workspace_1",
        name: "Atlas",
        slug: "atlas",
      },
      workspaceRole: "member",
      platformRole: "user",
      canManageWorkspace: false,
      isPlatformAdmin: false,
      inviteAllowlistCount: 1,
      requiresWorkspaceSelection: false,
      workspaceSelectionSource: "default",
    });
  });

  it("honors explicit workspace headers in multi-tenant mode", async () => {
    const { caller } = createCaller({
      tenancyMode: "multi-tenant",
      headers: {
        "x-gmacko-workspace-id": "workspace_2",
      },
      sessionUser: {
        id: "user_2",
        name: "Jordan",
        email: "jordan@example.com",
        emailVerified: true,
        image: null,
        role: "user",
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
        updatedAt: new Date("2026-03-27T00:00:00.000Z"),
      },
      applicationSettings: {
        id: randomUUID(),
        setupCompletedAt: new Date("2026-03-27T01:00:00.000Z"),
        setupCompletedByUserId: "admin_1",
        initialWorkspaceId: "workspace_1",
        tenancyMode: "multi-tenant",
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
        updatedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Atlas",
          slug: "atlas",
          ownerUserId: "user_2",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
        {
          id: "workspace_2",
          name: "Beacon",
          slug: "beacon",
          ownerUserId: "user_2",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: "membership_1",
          workspaceId: "workspace_1",
          userId: "user_2",
          role: "member",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
        {
          id: "membership_2",
          workspaceId: "workspace_2",
          userId: "user_2",
          role: "owner",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    const settingsCaller = caller.settings as unknown as {
      getWorkspaceContext: () => Promise<{
        workspace: { id: string; name: string; slug: string } | null;
        workspaceRole: "owner" | "admin" | "member" | null;
        requiresWorkspaceSelection: boolean;
        workspaceSelectionSource: string;
      }>;
    };

    await expect(settingsCaller.getWorkspaceContext()).resolves.toMatchObject({
      workspace: {
        id: "workspace_2",
        name: "Beacon",
        slug: "beacon",
      },
      workspaceRole: "owner",
      requiresWorkspaceSelection: false,
      workspaceSelectionSource: "header",
    });
  });

  it("requires workspace selection in multi-tenant mode when no workspace is requested", async () => {
    const { caller } = createCaller({
      tenancyMode: "multi-tenant",
      sessionUser: {
        id: "user_2",
        name: "Jordan",
        email: "jordan@example.com",
        emailVerified: true,
        image: null,
        role: "user",
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
        updatedAt: new Date("2026-03-27T00:00:00.000Z"),
      },
      applicationSettings: {
        id: randomUUID(),
        setupCompletedAt: new Date("2026-03-27T01:00:00.000Z"),
        setupCompletedByUserId: "admin_1",
        initialWorkspaceId: null,
        tenancyMode: "multi-tenant",
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
        updatedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Atlas",
          slug: "atlas",
          ownerUserId: "user_2",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
        {
          id: "workspace_2",
          name: "Beacon",
          slug: "beacon",
          ownerUserId: "user_2",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: "membership_1",
          workspaceId: "workspace_1",
          userId: "user_2",
          role: "member",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
        {
          id: "membership_2",
          workspaceId: "workspace_2",
          userId: "user_2",
          role: "owner",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    const settingsCaller = caller.settings as unknown as {
      getWorkspaceContext: () => Promise<{
        workspace: { id: string; name: string; slug: string } | null;
        workspaceRole: "owner" | "admin" | "member" | null;
        availableWorkspaces: Array<{ id: string; name: string; slug: string }>;
        requiresWorkspaceSelection: boolean;
        workspaceSelectionSource: string;
      }>;
    };

    await expect(settingsCaller.getWorkspaceContext()).resolves.toMatchObject({
      workspace: null,
      workspaceRole: null,
      availableWorkspaces: [
        {
          id: "workspace_1",
          name: "Atlas",
          slug: "atlas",
        },
        {
          id: "workspace_2",
          name: "Beacon",
          slug: "beacon",
        },
      ],
      requiresWorkspaceSelection: true,
      workspaceSelectionSource: "none",
    });
  });
});

describe("settings collaboration invites", () => {
  it("lists pending invites for a manageable current workspace", async () => {
    const inviteAId = randomUUID();
    const inviteBId = randomUUID();
    const { caller } = createCaller({
      sessionUser: {
        id: "admin_1",
        name: "Avery",
        email: "avery@example.com",
        emailVerified: true,
        image: null,
        role: "admin",
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
        updatedAt: new Date("2026-03-27T00:00:00.000Z"),
      },
      applicationSettings: {
        id: randomUUID(),
        setupCompletedAt: new Date("2026-03-27T01:00:00.000Z"),
        setupCompletedByUserId: "admin_1",
        initialWorkspaceId: "workspace_1",
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
        updatedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Atlas",
          slug: "atlas",
          ownerUserId: "admin_1",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: "membership_1",
          workspaceId: "workspace_1",
          userId: "admin_1",
          role: "owner",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
      ],
      allowlistEntries: [
        {
          id: inviteAId,
          workspaceId: "workspace_1",
          email: "alpha@example.com",
          role: "member",
          invitedByUserId: "admin_1",
          createdAt: new Date("2026-03-27T02:00:00.000Z"),
          updatedAt: null,
        },
        {
          id: inviteBId,
          workspaceId: "workspace_1",
          email: "beta@example.com",
          role: "admin",
          invitedByUserId: "admin_1",
          createdAt: new Date("2026-03-27T03:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    const settingsCaller = caller.settings as unknown as {
      listInvites: () => Promise<
        Array<{ id: string; email: string; role: "admin" | "member" }>
      >;
    };

    await expect(settingsCaller.listInvites()).resolves.toEqual([
      {
        id: inviteAId,
        email: "alpha@example.com",
        role: "member",
      },
      {
        id: inviteBId,
        email: "beta@example.com",
        role: "admin",
      },
    ]);
  });

  it("hides pending invites when the current user cannot manage the workspace", async () => {
    const { caller } = createCaller({
      sessionUser: {
        id: "member_1",
        name: "Casey",
        email: "casey@example.com",
        emailVerified: true,
        image: null,
        role: "user",
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
        updatedAt: new Date("2026-03-27T00:00:00.000Z"),
      },
      applicationSettings: {
        id: randomUUID(),
        setupCompletedAt: new Date("2026-03-27T01:00:00.000Z"),
        setupCompletedByUserId: "owner_1",
        initialWorkspaceId: "workspace_1",
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
        updatedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Atlas",
          slug: "atlas",
          ownerUserId: "owner_1",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: "membership_member",
          workspaceId: "workspace_1",
          userId: "member_1",
          role: "member",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
      ],
      allowlistEntries: [
        {
          id: randomUUID(),
          workspaceId: "workspace_1",
          email: "pending@example.com",
          role: "member",
          invitedByUserId: "owner_1",
          createdAt: new Date("2026-03-27T02:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    const settingsCaller = caller.settings as unknown as {
      listInvites: () => Promise<
        Array<{ id: string; email: string; role: "admin" | "member" }>
      >;
    };

    await expect(settingsCaller.listInvites()).resolves.toEqual([]);
  });

  it("creates and accepts invite-based collaboration entries", async () => {
    const inviteId = randomUUID();
    const { caller, state } = createCaller({
      sessionUser: {
        id: "user_1",
        name: "Taylor",
        email: "invitee@example.com",
        emailVerified: true,
        image: null,
        role: "user",
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
        updatedAt: new Date("2026-03-27T00:00:00.000Z"),
      },
      applicationSettings: {
        id: randomUUID(),
        setupCompletedAt: new Date("2026-03-27T01:00:00.000Z"),
        setupCompletedByUserId: "owner_1",
        initialWorkspaceId: "workspace_1",
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
        updatedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Atlas",
          slug: "atlas",
          ownerUserId: "owner_1",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: "membership_owner",
          workspaceId: "workspace_1",
          userId: "owner_1",
          role: "owner",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    state.user.id = "owner_1";
    state.user.email = "owner@example.com";
    state.user.role = "admin";

    const settingsCaller = caller.settings as unknown as {
      createInvite: (input: {
        email: string;
        role: "admin" | "member";
      }) => Promise<{
        id: string;
        email: string;
        role: "admin" | "member";
      }>;
      acceptInvite: (input: { inviteId: string }) => Promise<{
        workspaceId: string;
        role: "owner" | "admin" | "member";
      }>;
    };

    await expect(
      settingsCaller.createInvite({
        email: "invitee@example.com",
        role: "member",
      }),
    ).resolves.toMatchObject({
      email: "invitee@example.com",
      role: "member",
    });

    const createdInvite = state.allowlistEntries.at(-1);
    expect(createdInvite).toBeDefined();
    if (!createdInvite) {
      throw new Error("expected created invite");
    }

    createdInvite.id = inviteId;

    state.user.id = "user_1";
    state.user.email = "invitee@example.com";
    state.user.role = "user";

    await expect(
      settingsCaller.acceptInvite({ inviteId }),
    ).resolves.toMatchObject({
      workspaceId: "workspace_1",
      role: "member",
    });

    expect(
      state.memberships.some(
        (membership) =>
          membership.workspaceId === "workspace_1" &&
          membership.userId === "user_1" &&
          membership.role === "member",
      ),
    ).toBe(true);
    expect(state.allowlistEntries.some((entry) => entry.id === inviteId)).toBe(
      false,
    );
  });

  it("rejects owner invite roles in v1", async () => {
    const { caller } = createCaller({
      sessionUser: {
        id: "owner_1",
        name: "Avery",
        email: "avery@example.com",
        emailVerified: true,
        image: null,
        role: "admin",
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
        updatedAt: new Date("2026-03-27T00:00:00.000Z"),
      },
      applicationSettings: {
        id: randomUUID(),
        setupCompletedAt: new Date("2026-03-27T01:00:00.000Z"),
        setupCompletedByUserId: "owner_1",
        initialWorkspaceId: "workspace_1",
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
        updatedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Atlas",
          slug: "atlas",
          ownerUserId: "owner_1",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: "membership_owner",
          workspaceId: "workspace_1",
          userId: "owner_1",
          role: "owner",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    const settingsCaller = caller.settings as unknown as {
      createInvite: (input: {
        email: string;
        role: "admin" | "member";
      }) => Promise<unknown>;
    };

    await expect(
      settingsCaller.createInvite({
        email: "invitee@example.com",
        role: "owner" as never,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects accepting an invite when the account already belongs to another workspace", async () => {
    const inviteId = randomUUID();
    const { caller, state } = createCaller({
      sessionUser: {
        id: "user_1",
        name: "Taylor",
        email: "invitee@example.com",
        emailVerified: true,
        image: null,
        role: "user",
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
        updatedAt: new Date("2026-03-27T00:00:00.000Z"),
      },
      applicationSettings: {
        id: randomUUID(),
        setupCompletedAt: new Date("2026-03-27T01:00:00.000Z"),
        setupCompletedByUserId: "owner_1",
        initialWorkspaceId: "workspace_1",
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
        updatedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Atlas",
          slug: "atlas",
          ownerUserId: "owner_1",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
        {
          id: "workspace_2",
          name: "Beacon",
          slug: "beacon",
          ownerUserId: "owner_1",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: "membership_other",
          workspaceId: "workspace_2",
          userId: "user_1",
          role: "member",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      allowlistEntries: [
        {
          id: inviteId,
          workspaceId: "workspace_1",
          email: "invitee@example.com",
          role: "member",
          invitedByUserId: "owner_1",
          createdAt: new Date("2026-03-27T02:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    const settingsCaller = caller.settings as unknown as {
      acceptInvite: (input: { inviteId: string }) => Promise<unknown>;
    };

    await expect(
      settingsCaller.acceptInvite({ inviteId }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(
      state.memberships.some(
        (membership) =>
          membership.workspaceId === "workspace_1" &&
          membership.userId === "user_1",
      ),
    ).toBe(false);
    expect(state.allowlistEntries.some((entry) => entry.id === inviteId)).toBe(
      true,
    );
  });
});

describe("settings billing overview", () => {
  it("keeps billing and usage hidden when the SaaS billing layers are disabled", async () => {
    const originalFeatures = { ...saasFeatures };
    Object.assign(saasFeatures, {
      collaboration: false,
      billing: false,
      metering: false,
      support: false,
      launch: false,
      referrals: false,
      operatorApis: false,
    });

    const { caller } = createCaller({
      applicationSettings: {
        id: randomUUID(),
        setupCompletedAt: new Date("2026-03-27T01:00:00.000Z"),
        setupCompletedByUserId: "user_1",
        initialWorkspaceId: "workspace_1",
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
        updatedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Acme",
          slug: "acme",
          ownerUserId: "user_1",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: randomUUID(),
          workspaceId: "workspace_1",
          userId: "user_1",
          role: "owner",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      billingPlans: [
        {
          id: "plan_free",
          key: "free",
          name: "Free",
          description: null,
          interval: "month",
          amountInCents: 0,
          currency: "usd",
          isDefault: true,
          active: true,
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    try {
      const result = await caller.settings.getBillingOverview();

      expect(result.billing.visible).toBe(false);
      expect(result.usage.visible).toBe(false);
    } finally {
      Object.assign(saasFeatures, originalFeatures);
    }
  });

  it("shows billing and usage when the corresponding SaaS features are enabled", async () => {
    const originalFeatures = { ...saasFeatures };
    Object.assign(saasFeatures, {
      collaboration: false,
      billing: true,
      metering: true,
      support: false,
      launch: false,
      referrals: false,
      operatorApis: false,
    });

    const periodStart = new Date("2026-03-01T00:00:00.000Z");
    const periodEnd = new Date("2026-04-01T00:00:00.000Z");

    const { caller } = createCaller({
      applicationSettings: {
        id: randomUUID(),
        setupCompletedAt: new Date("2026-03-27T01:00:00.000Z"),
        setupCompletedByUserId: "user_1",
        initialWorkspaceId: "workspace_1",
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
        updatedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Acme",
          slug: "acme",
          ownerUserId: "user_1",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: randomUUID(),
          workspaceId: "workspace_1",
          userId: "user_1",
          role: "owner",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      billingPlans: [
        {
          id: "plan_pro",
          key: "pro",
          name: "Pro",
          description: "Expanded limits",
          interval: "month",
          amountInCents: 4900,
          currency: "usd",
          isDefault: false,
          active: true,
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      billingPlanLimits: [
        {
          id: randomUUID(),
          planId: "plan_pro",
          key: "api_calls",
          value: 1000,
          period: "month",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      subscriptions: [
        {
          id: randomUUID(),
          workspaceId: "workspace_1",
          planId: "plan_pro",
          status: "active",
          provider: "manual",
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      usageMeters: [
        {
          id: "meter_api_calls",
          key: "api_calls",
          name: "API Calls",
          description: null,
          aggregation: "sum",
          unit: "calls",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      usageRollups: [
        {
          id: randomUUID(),
          workspaceId: "workspace_1",
          meterId: "meter_api_calls",
          periodStart,
          periodEnd,
          quantity: 250,
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    try {
      const result = await caller.settings.getBillingOverview();

      expect(result.billing.visible).toBe(true);
      expect(result.billing.plan?.key).toBe("pro");
      expect(result.usage.visible).toBe(true);
      expect(result.usage.limits).toEqual([
        {
          currentUsage: 250,
          key: "api_calls",
          period: "month",
          value: 1000,
        },
      ]);
    } finally {
      Object.assign(saasFeatures, originalFeatures);
    }
  });

  it("exposes shared platform primitives for workspace surfaces", async () => {
    const settingsCaller = createCaller().caller.settings as unknown as {
      getPlatformPrimitives: () => Promise<{
        botProtection: { enabled: boolean; provider: string };
        compliance: {
          dataDeletion: boolean;
          dataExport: boolean;
          enabled: boolean;
        };
        emailDelivery: { enabled: boolean; provider: string };
        featureFlags: { enabled: boolean; provider: string };
        jobs: { enabled: boolean; provider: string };
        rateLimits: { enabled: boolean; scopes: string[] };
      }>;
    };

    await expect(settingsCaller.getPlatformPrimitives()).resolves.toMatchObject(
      {
        featureFlags: { enabled: true, provider: "local" },
        jobs: { enabled: true, provider: "local" },
        rateLimits: expect.objectContaining({
          enabled: true,
          scopes: expect.arrayContaining(["auth", "contact", "operator-api"]),
        }),
        botProtection: {
          enabled: true,
          provider: "local-rate-limit",
        },
        compliance: {
          dataDeletion: true,
          dataExport: true,
          enabled: true,
        },
        emailDelivery: {
          enabled: false,
          provider: "none",
        },
      },
    );
  });
});
