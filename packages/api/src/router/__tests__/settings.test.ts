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
  role: "admin" | "member";
  invitedByUserId: string;
  createdAt: Date;
  updatedAt: Date | null;
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
    selectedInviteId: null as string | null,
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
        findMany: vi.fn(async () =>
          sortMemberships().filter((entry) => entry.userId === state.user.id),
        ),
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
        findFirst: vi.fn(async ({ where }: { where?: unknown } = {}) => {
          void where;
          const row =
            state.allowlistEntries.find(
              (entry) =>
                entry.workspaceId === state.selectedWorkspaceId ||
                entry.id === state.selectedWorkspaceId,
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
                workspaceId: values.workspaceId ?? state.selectedWorkspaceId!,
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
                workspaceId: values.workspaceId ?? state.selectedWorkspaceId!,
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
