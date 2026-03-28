import { randomUUID } from "node:crypto";
import {
  applicationSettings,
  user,
  waitlistEntry,
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
  maintenanceMode: boolean;
  signupEnabled: boolean;
  announcementMessage: string | null;
  announcementTone: string;
  allowedEmailDomains: string[];
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

type TestWaitlistEntry = {
  id: string;
  email: string;
  source: "landing" | "contact" | "referral" | "blocked-signup";
  status: "pending" | "contacted" | "approved" | "dismissed";
  referralCode: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
};

type TestWorkspaceInviteAllowlistEntry = {
  id: string;
  workspaceId: string;
  email: string;
  role: "owner" | "admin" | "member";
  invitedByUserId: string;
  createdAt: Date;
  updatedAt: Date | null;
};

function createFakeDb(input?: {
  user?: TestUser;
  applicationSettings?: TestApplicationSettings | null;
  workspaces?: TestWorkspace[];
  memberships?: TestWorkspaceMembership[];
  failApplicationSettingsInsert?: boolean;
  waitlistEntries?: TestWaitlistEntry[];
  inviteAllowlistEntries?: TestWorkspaceInviteAllowlistEntry[];
}) {
  const sortWorkspaces = (rows: TestWorkspace[]) =>
    [...rows].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );

  const state = {
    user: input?.user ?? {
      id: "user_1",
      name: "Taylor",
      email: "taylor@example.com",
      emailVerified: true,
      image: null,
      role: "user" as const,
      createdAt: new Date("2026-03-27T00:00:00.000Z"),
      updatedAt: new Date("2026-03-27T00:00:00.000Z"),
    },
    applicationSettings: input?.applicationSettings ?? null,
    workspaces: [...(input?.workspaces ?? [])],
    memberships: [...(input?.memberships ?? [])],
    waitlistEntries: [...(input?.waitlistEntries ?? [])],
    inviteAllowlistEntries: [...(input?.inviteAllowlistEntries ?? [])],
    selectedWaitlistEntryId: null as string | null,
  };

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
    query: {
      applicationSettings: {
        findFirst: vi.fn(async () => state.applicationSettings),
      },
      waitlistEntry: {
        findMany: vi.fn(async () => [...state.waitlistEntries]),
      },
    },
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        ...(() => {
          if (table === workspace) {
            return makeRowsQuery(sortWorkspaces(state.workspaces));
          }

          if (table === user) {
            return makeRowsQuery([state.user]);
          }

          if (table === workspaceMembership) {
            return makeRowsQuery([...state.memberships]);
          }

          throw new Error("Unexpected select table");
        })(),
      }),
    })),
    update: vi.fn((table: unknown) => {
      if (table === user) {
        return {
          set: (values: Partial<TestUser>) => ({
            where: () => ({
              returning: async () => {
                state.user = {
                  ...state.user,
                  ...values,
                  updatedAt: new Date("2026-03-27T01:00:00.000Z"),
                };

                return [state.user];
              },
            }),
          }),
        };
      }

      if (table === applicationSettings) {
        return {
          set: (values: Partial<TestApplicationSettings>) => ({
            where: () => ({
              returning: async () => {
                if (!state.applicationSettings) {
                  return [];
                }

                state.applicationSettings = {
                  ...state.applicationSettings,
                  ...values,
                  updatedAt: new Date("2026-03-27T01:00:00.000Z"),
                };

                return [state.applicationSettings];
              },
            }),
          }),
        };
      }

      if (table === waitlistEntry) {
        return {
          set: (values: Partial<TestWaitlistEntry>) => ({
            where: () => ({
              returning: async () => {
                const selectedWaitlistEntryId =
                  state.selectedWaitlistEntryId ?? state.waitlistEntries[0]?.id;
                const index = state.waitlistEntries.findIndex(
                  (entry) => entry.id === selectedWaitlistEntryId,
                );

                if (index === -1) {
                  return [];
                }

                state.waitlistEntries[index] = {
                  id: state.waitlistEntries[index]!.id,
                  email: state.waitlistEntries[index]!.email,
                  source: state.waitlistEntries[index]!.source,
                  status: values.status ?? state.waitlistEntries[index]!.status,
                  referralCode:
                    values.referralCode ??
                    state.waitlistEntries[index]!.referralCode,
                  reviewedByUserId:
                    values.reviewedByUserId ??
                    state.waitlistEntries[index]!.reviewedByUserId,
                  reviewedAt:
                    values.reviewedAt ??
                    state.waitlistEntries[index]!.reviewedAt,
                  createdAt: state.waitlistEntries[index]!.createdAt,
                  updatedAt: new Date("2026-03-27T01:00:00.000Z"),
                };

                return [state.waitlistEntries[index]];
              },
            }),
          }),
        };
      }

      throw new Error("Unexpected update table");
    }),
    insert: vi.fn((table: unknown) => {
      if (table === workspace) {
        return {
          values: (values: Partial<TestWorkspace>) => ({
            returning: async () => {
              const row: TestWorkspace = {
                id: randomUUID(),
                name: values.name ?? "Workspace",
                slug: values.slug ?? "workspace",
                ownerUserId: values.ownerUserId ?? state.user.id,
                createdAt: new Date("2026-03-27T01:00:00.000Z"),
                updatedAt: null,
              };

              state.workspaces.push(row);
              return [row];
            },
          }),
        };
      }

      if (table === applicationSettings) {
        return {
          values: (values: Partial<TestApplicationSettings>) => ({
            returning: async () => {
              if (input?.failApplicationSettingsInsert) {
                throw new Error("application settings insert failed");
              }

              const row: TestApplicationSettings = {
                id: randomUUID(),
                setupCompletedAt: values.setupCompletedAt ?? null,
                setupCompletedByUserId: values.setupCompletedByUserId ?? null,
                initialWorkspaceId: values.initialWorkspaceId ?? null,
                maintenanceMode: values.maintenanceMode ?? false,
                signupEnabled: values.signupEnabled ?? true,
                announcementMessage: values.announcementMessage ?? null,
                announcementTone: values.announcementTone ?? "info",
                allowedEmailDomains: values.allowedEmailDomains ?? [],
                createdAt: new Date("2026-03-27T01:00:00.000Z"),
                updatedAt: null,
              };

              state.applicationSettings = row;
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
                id: randomUUID(),
                workspaceId: values.workspaceId ?? randomUUID(),
                userId: values.userId ?? state.user.id,
                role: values.role ?? "member",
                createdAt: new Date("2026-03-27T01:00:00.000Z"),
                updatedAt: null,
              };

              state.memberships.push(row);
              return [row];
            },
          }),
        };
      }

      if (table === workspaceInviteAllowlist) {
        return {
          values: (values: Partial<TestWorkspaceInviteAllowlistEntry>) => ({
            ...(() => {
              const row: TestWorkspaceInviteAllowlistEntry = {
                id: values.id ?? randomUUID(),
                workspaceId: values.workspaceId ?? "workspace_1",
                email: values.email ?? "invitee@example.com",
                role: values.role ?? "member",
                invitedByUserId: values.invitedByUserId ?? state.user.id,
                createdAt:
                  values.createdAt ?? new Date("2026-03-27T02:00:00.000Z"),
                updatedAt: values.updatedAt ?? null,
              };

              state.inviteAllowlistEntries.push(row);

              return {
                returning: async () => [row],
              };
            })(),
          }),
        };
      }

      throw new Error("Unexpected insert table");
    }),
    transaction: vi.fn(async (fn: (tx: typeof db) => Promise<unknown>) => {
      const snapshot = {
        user: structuredClone(state.user),
        applicationSettings: state.applicationSettings
          ? structuredClone(state.applicationSettings)
          : null,
        workspaces: structuredClone(state.workspaces),
        memberships: structuredClone(state.memberships),
        waitlistEntries: structuredClone(state.waitlistEntries),
      };

      try {
        return await fn(db);
      } catch (error) {
        state.user = snapshot.user;
        state.applicationSettings = snapshot.applicationSettings;
        state.workspaces = snapshot.workspaces;
        state.memberships = snapshot.memberships;
        state.waitlistEntries = snapshot.waitlistEntries;
        throw error;
      }
    }),
  };

  return { db, state };
}

function createCaller(options?: {
  sessionUser?: TestUser | null;
  applicationSettings?: TestApplicationSettings | null;
  workspaces?: TestWorkspace[];
  memberships?: TestWorkspaceMembership[];
  failApplicationSettingsInsert?: boolean;
  waitlistEntries?: TestWaitlistEntry[];
}) {
  const { db, state } = createFakeDb({
    user: options?.sessionUser ?? undefined,
    applicationSettings: options?.applicationSettings ?? undefined,
    workspaces: options?.workspaces,
    memberships: options?.memberships,
    failApplicationSettingsInsert: options?.failApplicationSettingsInsert,
    waitlistEntries: options?.waitlistEntries,
  });

  const sessionUser = options?.sessionUser ?? state.user;
  const session = sessionUser
    ? {
        user: sessionUser,
        session: null,
      }
    : null;

  const caller = appRouter.createCaller({
    db: db as never,
    session,
    apiKeyAuth: null,
    authApi: {
      getSession: vi.fn(async () => session),
    },
  } as never);

  return { caller, state };
}

describe("admin bootstrap", () => {
  it("reports when the app still needs first-run setup", async () => {
    const { caller } = createCaller({ sessionUser: null });
    const adminCaller = caller.admin as unknown as {
      bootstrapStatus: () => Promise<{
        isInitialized: boolean;
        requiresSetup: boolean;
        hasExistingWorkspace?: boolean;
      }>;
    };

    await expect(adminCaller.bootstrapStatus()).resolves.toMatchObject({
      isInitialized: false,
      requiresSetup: true,
    });
  });

  it("treats an existing workspace without setup completion as partial bootstrap state", async () => {
    const { caller } = createCaller({
      workspaces: [
        {
          id: randomUUID(),
          name: "Acme HQ",
          slug: "acme-hq",
          ownerUserId: "user_1",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });
    const adminCaller = caller.admin as unknown as {
      bootstrapStatus: () => Promise<{
        isInitialized: boolean;
        requiresSetup: boolean;
        hasExistingWorkspace: boolean;
      }>;
      completeBootstrap: (input: { workspaceName: string }) => Promise<unknown>;
    };

    await expect(adminCaller.bootstrapStatus()).resolves.toMatchObject({
      isInitialized: false,
      requiresSetup: true,
      hasExistingWorkspace: true,
    });

    await expect(
      adminCaller.completeBootstrap({ workspaceName: "Acme HQ" }),
    ).rejects.toThrow("Bootstrap has already started");
  });

  it("completes first-run setup for the first authenticated user", async () => {
    const { caller, state } = createCaller();
    const adminCaller = caller.admin as unknown as {
      completeBootstrap: (input: { workspaceName: string }) => Promise<{
        setupCompleted: boolean;
        workspace: { name: string; ownerUserId: string };
      }>;
    };

    await expect(
      adminCaller.completeBootstrap({ workspaceName: "Acme HQ" }),
    ).resolves.toMatchObject({
      setupCompleted: true,
      workspace: {
        name: "Acme HQ",
        ownerUserId: state.user.id,
      },
    });

    expect(state.user.role).toBe("admin");
    expect(state.applicationSettings?.setupCompletedByUserId).toBe(
      state.user.id,
    );
    expect(state.workspaces).toHaveLength(1);
  });

  it("does not persist partial bootstrap state when setup fails mid-flight", async () => {
    const { caller, state } = createCaller({
      failApplicationSettingsInsert: true,
    });
    const adminCaller = caller.admin as unknown as {
      completeBootstrap: (input: { workspaceName: string }) => Promise<unknown>;
      bootstrapStatus: () => Promise<{
        isInitialized: boolean;
        requiresSetup: boolean;
      }>;
    };

    await expect(
      adminCaller.completeBootstrap({ workspaceName: "Acme HQ" }),
    ).rejects.toThrow("application settings insert failed");

    expect(state.user.role).toBe("user");
    expect(state.workspaces).toHaveLength(0);
    expect(state.applicationSettings).toBeNull();

    await expect(adminCaller.bootstrapStatus()).resolves.toMatchObject({
      isInitialized: false,
      requiresSetup: true,
    });
  });

  it("lists workspaces with membership counts in creation order", async () => {
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
          role: "owner",
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: null,
        },
        {
          id: "membership_2",
          workspaceId: "workspace_1",
          userId: "user_2",
          role: "member",
          createdAt: new Date("2026-03-27T00:10:00.000Z"),
          updatedAt: null,
        },
        {
          id: "membership_3",
          workspaceId: "workspace_2",
          userId: "admin_1",
          role: "owner",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    const adminCaller = caller.admin as unknown as {
      listWorkspaces: () => Promise<
        Array<{
          id: string;
          name: string;
          slug: string;
          ownerUserId: string;
          membershipCount: number;
          createdAt: Date;
        }>
      >;
    };

    await expect(adminCaller.listWorkspaces()).resolves.toEqual([
      {
        id: "workspace_1",
        name: "Atlas",
        slug: "atlas",
        ownerUserId: "admin_1",
        membershipCount: 2,
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
      },
      {
        id: "workspace_2",
        name: "Beacon",
        slug: "beacon",
        ownerUserId: "admin_1",
        membershipCount: 1,
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
      },
    ]);
  });
});

describe("admin launch controls", () => {
  it("exposes launch settings and reviewable waitlist entries", async () => {
    const { caller, state } = createCaller({
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
        maintenanceMode: false,
        signupEnabled: true,
        announcementMessage: null,
        announcementTone: "info",
        allowedEmailDomains: [],
        createdAt: new Date("2026-03-27T01:00:00.000Z"),
        updatedAt: null,
      },
      workspaces: [
        {
          id: "workspace_1",
          name: "Acme",
          slug: "acme",
          ownerUserId: "admin_1",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      memberships: [
        {
          id: randomUUID(),
          workspaceId: "workspace_1",
          userId: "admin_1",
          role: "owner",
          createdAt: new Date("2026-03-27T01:00:00.000Z"),
          updatedAt: null,
        },
      ],
      waitlistEntries: [
        {
          id: "waitlist_1",
          email: "alpha@example.com",
          source: "landing",
          status: "pending",
          referralCode: null,
          reviewedByUserId: null,
          reviewedAt: null,
          createdAt: new Date("2026-03-27T02:00:00.000Z"),
          updatedAt: null,
        },
      ],
    });

    state.selectedWaitlistEntryId = "waitlist_1";

    const adminCaller = caller.admin as unknown as {
      getLaunchControls: () => Promise<{
        maintenanceMode: boolean;
        signupEnabled: boolean;
        allowedEmailDomains: string[];
        platformPrimitives: {
          botProtection: { enabled: boolean; provider: string };
          compliance: { dataExport: boolean; enabled: boolean };
          featureFlags: { enabled: boolean; provider: string };
          jobs: { enabled: boolean; provider: string };
          rateLimits: { enabled: boolean; scopes: string[] };
        };
        waitlistCount: number;
      }>;
      reviewWaitlistEntry: (input: {
        waitlistEntryId: string;
        status: "pending" | "contacted" | "approved" | "dismissed";
      }) => Promise<unknown>;
    };

    await expect(adminCaller.getLaunchControls()).resolves.toEqual({
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
        botProtection: {
          enabled: true,
          provider: "local-rate-limit",
        },
        compliance: expect.objectContaining({
          dataExport: true,
          enabled: true,
        }),
      }),
      waitlistCount: 1,
    });

    await expect(
      adminCaller.reviewWaitlistEntry({
        waitlistEntryId: "waitlist_1",
        status: "approved",
      }),
    ).resolves.toMatchObject({
      id: "waitlist_1",
      status: "approved",
    });

    expect(state.waitlistEntries[0]?.status).toBe("approved");
    expect(state.waitlistEntries[0]?.reviewedByUserId).toBe("admin_1");
    expect(state.inviteAllowlistEntries).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        email: "alpha@example.com",
        role: "member",
        invitedByUserId: "admin_1",
      }),
    );
  });
});
