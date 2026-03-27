import { randomUUID } from "node:crypto";
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
};

function createCaller(options?: {
  sessionUser?: TestUser;
  applicationSettings?: TestApplicationSettings | null;
  workspaces?: TestWorkspace[];
  memberships?: TestWorkspaceMembership[];
  allowlistEntries?: TestAllowlistEntry[];
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
    selectedWorkspaceId: null as string | null,
  };

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
      },
      workspace: {
        findFirst: vi.fn(async () => {
          const workspaceId =
            state.selectedWorkspaceId ??
            state.applicationSettings?.initialWorkspaceId ??
            sortWorkspaces()[0]?.id ??
            null;

          const row = workspaceId
            ? (state.workspaces.find((entry) => entry.id === workspaceId) ??
              null)
            : null;

          if (row) {
            state.selectedWorkspaceId = row.id;
          }

          return row;
        }),
      },
      workspaceInviteAllowlist: {
        findMany: vi.fn(async () =>
          state.allowlistEntries.filter(
            (entry) => entry.workspaceId === state.selectedWorkspaceId,
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
    insert: vi.fn(() => {
      throw new Error("Unexpected insert");
    }),
    transaction: vi.fn(async () => {
      throw new Error("Unexpected transaction");
    }),
  };

  const caller = appRouter.createCaller({
    db: db as never,
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

  return { caller, state };
}

describe("settings workspace context", () => {
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
        },
        {
          id: randomUUID(),
          workspaceId: "workspace_2",
          email: "gamma@example.com",
        },
      ],
    });

    const settingsCaller = caller.settings as unknown as {
      getWorkspaceContext: () => Promise<{
        workspace: { id: string; name: string; slug: string } | null;
        workspaceRole: "owner" | "admin" | "member" | null;
        platformRole: "user" | "admin";
        canManageWorkspace: boolean;
        isPlatformAdmin: boolean;
        inviteAllowlistCount: number;
      }>;
    };

    await expect(settingsCaller.getWorkspaceContext()).resolves.toEqual({
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
        },
      ],
    });

    const settingsCaller = caller.settings as unknown as {
      getWorkspaceContext: () => Promise<{
        workspace: { id: string; name: string; slug: string } | null;
        workspaceRole: "owner" | "admin" | "member" | null;
        platformRole: "user" | "admin";
        canManageWorkspace: boolean;
        isPlatformAdmin: boolean;
        inviteAllowlistCount: number;
      }>;
    };

    await expect(settingsCaller.getWorkspaceContext()).resolves.toEqual({
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
    });
  });
});
