import { randomUUID } from "node:crypto";
import { applicationSettings, user, workspace } from "@gmacko/db/schema";
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
  createdAt: Date;
  updatedAt: Date | null;
};

function createFakeDb(input?: {
  user?: TestUser;
  applicationSettings?: TestApplicationSettings | null;
  workspaces?: TestWorkspace[];
  failApplicationSettingsInsert?: boolean;
}) {
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
  };

  const db = {
    query: {
      applicationSettings: {
        findFirst: vi.fn(async () => state.applicationSettings),
      },
    },
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        limit: async () => {
          if (table === workspace) {
            return state.workspaces.slice(0, 1);
          }

          throw new Error("Unexpected select table");
        },
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
                createdAt: new Date("2026-03-27T01:00:00.000Z"),
                updatedAt: null,
              };

              state.applicationSettings = row;
              return [row];
            },
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
      };

      try {
        return await fn(db);
      } catch (error) {
        state.user = snapshot.user;
        state.applicationSettings = snapshot.applicationSettings;
        state.workspaces = snapshot.workspaces;
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
  failApplicationSettingsInsert?: boolean;
}) {
  const { db, state } = createFakeDb({
    user: options?.sessionUser ?? undefined,
    applicationSettings: options?.applicationSettings ?? undefined,
    workspaces: options?.workspaces,
    failApplicationSettingsInsert: options?.failApplicationSettingsInsert,
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
});
