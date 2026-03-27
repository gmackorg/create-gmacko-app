import { canManageWorkspace, isPlatformAdminRole } from "@gmacko/auth";
import { and, eq, isNull } from "@gmacko/db";
import {
  apiKeys,
  UpdateUserPreferencesSchema,
  user,
  userPreferences,
  workspace,
  workspaceInviteAllowlist,
  workspaceMembership,
} from "@gmacko/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { createHash, randomBytes } from "crypto";
import { z } from "zod/v4";

import type { createTRPCContext } from "../trpc";
import { protectedProcedure } from "../trpc";

type SettingsContext = Awaited<ReturnType<typeof createTRPCContext>> & {
  session: NonNullable<
    Awaited<ReturnType<typeof createTRPCContext>>["session"]
  >;
};

function generateApiKey(): string {
  return `gmk_${randomBytes(32).toString("base64url")}`;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function getKeyPrefix(key: string): string {
  return key.substring(0, 12);
}

async function getWorkspaceScope(ctx: SettingsContext) {
  const [dbUser] = await ctx.db
    .select({
      id: user.id,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, ctx.session.user.id))
    .limit(1);

  const settings = await ctx.db.query.applicationSettings.findFirst();

  const membership = settings?.initialWorkspaceId
    ? await ctx.db.query.workspaceMembership.findFirst({
        where: and(
          eq(workspaceMembership.userId, ctx.session.user.id),
          eq(workspaceMembership.workspaceId, settings.initialWorkspaceId),
        ),
      })
    : await ctx.db.query.workspaceMembership.findFirst({
        where: eq(workspaceMembership.userId, ctx.session.user.id),
        orderBy: (membership, { asc }) => [
          asc(membership.createdAt),
          asc(membership.id),
        ],
      });

  const fallbackWorkspace =
    !membership && settings?.initialWorkspaceId
      ? await ctx.db.query.workspace.findFirst({
          where: eq(workspace.id, settings.initialWorkspaceId),
        })
      : null;

  const currentWorkspace = membership
    ? await ctx.db.query.workspace.findFirst({
        where: eq(workspace.id, membership.workspaceId),
      })
    : fallbackWorkspace;

  const currentWorkspaceId =
    currentWorkspace?.id ?? settings?.initialWorkspaceId ?? null;
  const currentWorkspaceRole = membership?.role ?? null;
  const canManageCurrentWorkspace = canManageWorkspace(currentWorkspaceRole);

  return {
    currentWorkspace,
    currentWorkspaceId,
    currentWorkspaceRole,
    canManageCurrentWorkspace,
    platformRole: dbUser?.role ?? "user",
    isPlatformAdmin: isPlatformAdminRole(dbUser?.role),
  };
}

export const settingsRouter = {
  getWorkspaceContext: protectedProcedure.query(async ({ ctx }) => {
    const workspaceScope = await getWorkspaceScope(ctx);
    const { currentWorkspace, currentWorkspaceId } = workspaceScope;
    const inviteAllowlistEntries = currentWorkspaceId
      ? await ctx.db.query.workspaceInviteAllowlist.findMany({
          where: eq(workspaceInviteAllowlist.workspaceId, currentWorkspaceId),
          columns: { id: true },
        })
      : [];

    return {
      workspace: currentWorkspace
        ? {
            id: currentWorkspace.id,
            name: currentWorkspace.name,
            slug: currentWorkspace.slug,
          }
        : null,
      workspaceRole: workspaceScope.currentWorkspaceRole,
      platformRole: workspaceScope.platformRole,
      canManageWorkspace: workspaceScope.canManageCurrentWorkspace,
      isPlatformAdmin: workspaceScope.isPlatformAdmin,
      inviteAllowlistCount: inviteAllowlistEntries.length,
    };
  }),

  listInvites: protectedProcedure.query(async ({ ctx }) => {
    const workspaceScope = await getWorkspaceScope(ctx);

    if (
      !workspaceScope.currentWorkspaceId ||
      !workspaceScope.canManageCurrentWorkspace
    ) {
      return [];
    }

    const invites = await ctx.db.query.workspaceInviteAllowlist.findMany({
      where: eq(
        workspaceInviteAllowlist.workspaceId,
        workspaceScope.currentWorkspaceId,
      ),
      orderBy: (invite, { asc }) => [asc(invite.createdAt), asc(invite.id)],
    });

    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
    }));
  }),

  createInvite: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["admin", "member"]).default("member"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspaceScope = await getWorkspaceScope(ctx);

      if (
        !workspaceScope.currentWorkspaceId ||
        !workspaceScope.canManageCurrentWorkspace
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Workspace invite access requires manager permissions",
        });
      }

      const inviteEmail = input.email.trim().toLowerCase();
      const existingInvites =
        await ctx.db.query.workspaceInviteAllowlist.findMany({
          where: eq(
            workspaceInviteAllowlist.workspaceId,
            workspaceScope.currentWorkspaceId,
          ),
        });

      const existingInvite = existingInvites.find(
        (invite) => invite.email.toLowerCase() === inviteEmail,
      );

      if (existingInvite) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An invite already exists for that email",
        });
      }

      const [createdInvite] = await ctx.db
        .insert(workspaceInviteAllowlist)
        .values({
          workspaceId: workspaceScope.currentWorkspaceId,
          email: inviteEmail,
          role: input.role,
          invitedByUserId: ctx.session.user.id,
        })
        .returning({
          id: workspaceInviteAllowlist.id,
          email: workspaceInviteAllowlist.email,
          role: workspaceInviteAllowlist.role,
        });

      return createdInvite;
    }),

  acceptInvite: protectedProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invites = await ctx.db.query.workspaceInviteAllowlist.findMany();
      const invite = invites.find((entry) => entry.id === input.inviteId);

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found",
        });
      }

      if (invite.email.toLowerCase() !== ctx.session.user.email.toLowerCase()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Invite not found for this account",
        });
      }

      if (invite.role === "owner") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Owner invites are not supported in v1",
        });
      }

      const memberships = await ctx.db.query.workspaceMembership.findMany({
        where: eq(workspaceMembership.userId, ctx.session.user.id),
      });
      const existingMembership = memberships.find(
        (membership) => membership.workspaceId === invite.workspaceId,
      );
      const hasAnotherWorkspaceMembership = memberships.some(
        (membership) => membership.workspaceId !== invite.workspaceId,
      );

      if (hasAnotherWorkspaceMembership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This account is already attached to a different workspace",
        });
      }

      const membership =
        existingMembership ??
        (
          await ctx.db
            .insert(workspaceMembership)
            .values({
              workspaceId: invite.workspaceId,
              userId: ctx.session.user.id,
              role: invite.role,
            })
            .returning({
              workspaceId: workspaceMembership.workspaceId,
              role: workspaceMembership.role,
            })
        )[0];

      await ctx.db
        .delete(workspaceInviteAllowlist)
        .where(eq(workspaceInviteAllowlist.id, invite.id))
        .returning({ id: workspaceInviteAllowlist.id });

      return membership;
    }),

  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await ctx.db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, ctx.session.user.id),
    });

    if (!prefs) {
      const [newPrefs] = await ctx.db
        .insert(userPreferences)
        .values({ userId: ctx.session.user.id })
        .returning();
      return newPrefs;
    }

    return prefs;
  }),

  updatePreferences: protectedProcedure
    .input(UpdateUserPreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.userPreferences.findFirst({
        where: eq(userPreferences.userId, ctx.session.user.id),
      });

      if (!existing) {
        const [newPrefs] = await ctx.db
          .insert(userPreferences)
          .values({ userId: ctx.session.user.id, ...input })
          .returning();
        return newPrefs;
      }

      const [updated] = await ctx.db
        .update(userPreferences)
        .set(input)
        .where(eq(userPreferences.userId, ctx.session.user.id))
        .returning();

      return updated;
    }),

  listApiKeys: protectedProcedure.query(async ({ ctx }) => {
    const keys = await ctx.db.query.apiKeys.findMany({
      where: and(
        eq(apiKeys.userId, ctx.session.user.id),
        isNull(apiKeys.revokedAt),
      ),
      columns: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: (keys, { desc }) => [desc(keys.createdAt)],
    });

    return keys;
  }),

  createApiKey: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        permissions: z
          .array(z.enum(["read", "write", "delete", "admin"]))
          .min(1),
        expiresInDays: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = generateApiKey();
      const keyHash = hashApiKey(key);
      const keyPrefix = getKeyPrefix(key);

      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const [created] = await ctx.db
        .insert(apiKeys)
        .values({
          userId: ctx.session.user.id,
          name: input.name,
          keyHash,
          keyPrefix,
          permissions: input.permissions,
          expiresAt,
        })
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          permissions: apiKeys.permissions,
          expiresAt: apiKeys.expiresAt,
        });

      return {
        ...created,
        key,
      };
    }),

  revokeApiKey: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [revoked] = await ctx.db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(apiKeys.id, input.id),
            eq(apiKeys.userId, ctx.session.user.id),
            isNull(apiKeys.revokedAt),
          ),
        )
        .returning({ id: apiKeys.id });

      return { success: !!revoked };
    }),

  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const [deletedUser] = await ctx.db
      .delete(user)
      .where(eq(user.id, ctx.session.user.id))
      .returning({ id: user.id });

    return { success: !!deletedUser };
  }),
} satisfies TRPCRouterRecord;
