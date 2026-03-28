import { isPlatformAdminRole } from "@gmacko/auth";
import { platformPrimitives } from "@gmacko/config";
import { eq } from "@gmacko/db";
import {
  applicationSettings,
  user,
  userRoleEnum,
  waitlistEntry,
  workspace,
  workspaceInviteAllowlist,
  workspaceMembership,
} from "@gmacko/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { protectedProcedure, publicProcedure } from "../trpc";

function slugifyWorkspaceName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "workspace";
}

/**
 * Middleware that ensures the user has admin role.
 * Fetches the user's role from the database since better-auth session
 * doesn't include custom fields by default.
 */
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  // Fetch the user's role from the database
  const [dbUser] = await ctx.db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, ctx.session.user.id))
    .limit(1);

  if (!isPlatformAdminRole(dbUser?.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return next({
    ctx: {
      ...ctx,
      adminUser: { ...ctx.session.user, role: dbUser.role },
    },
  });
});

export const adminRouter = {
  getLaunchControls: adminProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.query.applicationSettings.findFirst();
    const waitlist = await ctx.db.query.waitlistEntry.findMany();

    return {
      maintenanceMode: settings?.maintenanceMode ?? false,
      signupEnabled: settings?.signupEnabled ?? true,
      announcementMessage: settings?.announcementMessage ?? null,
      announcementTone: settings?.announcementTone ?? "info",
      allowedEmailDomains: settings?.allowedEmailDomains ?? [],
      platformPrimitives: {
        featureFlags: {
          enabled: platformPrimitives.featureFlags.enabled,
          provider: platformPrimitives.featureFlags.provider,
        },
        jobs: {
          enabled: platformPrimitives.jobs.enabled,
          provider: platformPrimitives.jobs.provider,
        },
        rateLimits: {
          enabled: platformPrimitives.rateLimits.enabled,
          scopes: [...platformPrimitives.rateLimits.scopes],
        },
        botProtection: {
          enabled: platformPrimitives.botProtection.enabled,
          provider: platformPrimitives.botProtection.provider,
        },
        compliance: {
          enabled: platformPrimitives.compliance.enabled,
          dataExport: platformPrimitives.compliance.dataExport,
          dataDeletion: platformPrimitives.compliance.dataDeletion,
        },
        emailDelivery: {
          enabled: platformPrimitives.emailDelivery.enabled,
          provider: platformPrimitives.emailDelivery.provider,
          requiredEnv: [...platformPrimitives.emailDelivery.requiredEnv],
        },
      },
      waitlistCount: waitlist.length,
    };
  }),

  updateLaunchControls: adminProcedure
    .input(
      z.object({
        maintenanceMode: z.boolean().optional(),
        signupEnabled: z.boolean().optional(),
        announcementMessage: z.string().max(2000).nullable().optional(),
        announcementTone: z.enum(["info", "warning", "critical"]).optional(),
        allowedEmailDomains: z.array(z.string().min(1)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.db.query.applicationSettings.findFirst();

      const values = {
        maintenanceMode: input.maintenanceMode,
        signupEnabled: input.signupEnabled,
        announcementMessage: input.announcementMessage,
        announcementTone: input.announcementTone,
        allowedEmailDomains: input.allowedEmailDomains,
      };

      if (settings) {
        const [updated] = await ctx.db
          .update(applicationSettings)
          .set(values)
          .where(eq(applicationSettings.id, settings.id))
          .returning({
            id: applicationSettings.id,
            maintenanceMode: applicationSettings.maintenanceMode,
            signupEnabled: applicationSettings.signupEnabled,
            announcementMessage: applicationSettings.announcementMessage,
            announcementTone: applicationSettings.announcementTone,
            allowedEmailDomains: applicationSettings.allowedEmailDomains,
          });

        return updated;
      }

      const [created] = await ctx.db
        .insert(applicationSettings)
        .values(values)
        .returning({
          id: applicationSettings.id,
          maintenanceMode: applicationSettings.maintenanceMode,
          signupEnabled: applicationSettings.signupEnabled,
          announcementMessage: applicationSettings.announcementMessage,
          announcementTone: applicationSettings.announcementTone,
          allowedEmailDomains: applicationSettings.allowedEmailDomains,
        });

      return created;
    }),

  listWaitlistEntries: adminProcedure.query(async ({ ctx }) => {
    const entries = await ctx.db.query.waitlistEntry.findMany();

    return entries.map((entry) => ({
      id: entry.id,
      email: entry.email,
      source: entry.source,
      status: entry.status,
      message: entry.message,
      referralCode: entry.referralCode,
      reviewedByUserId: entry.reviewedByUserId,
      reviewedAt: entry.reviewedAt,
      createdAt: entry.createdAt,
    }));
  }),

  reviewWaitlistEntry: adminProcedure
    .input(
      z.object({
        waitlistEntryId: z.string(),
        status: z.enum(["pending", "contacted", "approved", "dismissed"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const currentSettings = await tx.query.applicationSettings.findFirst();
        const currentWaitlistEntry =
          (await tx.query.waitlistEntry.findMany()).find(
            (entry) => entry.id === input.waitlistEntryId,
          ) ?? null;

        if (!currentWaitlistEntry) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Waitlist entry not found",
          });
        }

        const [updated] = await tx
          .update(waitlistEntry)
          .set({
            status: input.status,
            reviewedByUserId: ctx.session.user.id,
            reviewedAt: new Date(),
          })
          .where(eq(waitlistEntry.id, input.waitlistEntryId))
          .returning({
            id: waitlistEntry.id,
            status: waitlistEntry.status,
            reviewedByUserId: waitlistEntry.reviewedByUserId,
            reviewedAt: waitlistEntry.reviewedAt,
          });

        if (!updated) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Waitlist entry not found",
          });
        }

        if (
          input.status === "approved" &&
          currentWaitlistEntry.status !== "approved" &&
          currentSettings?.initialWorkspaceId
        ) {
          await tx.insert(workspaceInviteAllowlist).values({
            workspaceId: currentSettings.initialWorkspaceId,
            email: currentWaitlistEntry.email,
            role: "member",
            invitedByUserId: ctx.session.user.id,
          });
        }

        return updated;
      });
    }),

  bootstrapStatus: publicProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.query.applicationSettings.findFirst();
    const existingWorkspace = await ctx.db.select().from(workspace).limit(1);

    return {
      isInitialized: !!settings?.setupCompletedAt,
      requiresSetup: !settings?.setupCompletedAt,
      hasExistingWorkspace: existingWorkspace.length > 0,
      setupCompletedAt: settings?.setupCompletedAt ?? null,
      initialWorkspaceId: settings?.initialWorkspaceId ?? null,
    };
  }),

  completeBootstrap: protectedProcedure
    .input(
      z.object({
        workspaceName: z.string().min(2).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const existingSettings = await tx.query.applicationSettings.findFirst();
        const existingWorkspace = await tx.select().from(workspace).limit(1);

        if (existingSettings?.setupCompletedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Bootstrap has already been completed",
          });
        }

        if (existingWorkspace.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Bootstrap has already started",
          });
        }

        const [createdWorkspace] = await tx
          .insert(workspace)
          .values({
            name: input.workspaceName,
            slug: slugifyWorkspaceName(input.workspaceName),
            ownerUserId: ctx.session.user.id,
          })
          .returning({
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            ownerUserId: workspace.ownerUserId,
          });

        if (!createdWorkspace) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create the initial workspace",
          });
        }

        await tx.insert(workspaceMembership).values({
          workspaceId: createdWorkspace.id,
          userId: ctx.session.user.id,
          role: "owner",
        });

        const [updatedUser] = await tx
          .update(user)
          .set({ role: "admin" })
          .where(eq(user.id, ctx.session.user.id))
          .returning({
            id: user.id,
            role: user.role,
          });

        if (!updatedUser) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Bootstrap user not found",
          });
        }

        const [settings] = existingSettings
          ? await tx
              .update(applicationSettings)
              .set({
                setupCompletedAt: new Date(),
                setupCompletedByUserId: ctx.session.user.id,
                initialWorkspaceId: createdWorkspace.id,
              })
              .where(eq(applicationSettings.id, existingSettings.id))
              .returning({
                id: applicationSettings.id,
                setupCompletedAt: applicationSettings.setupCompletedAt,
                setupCompletedByUserId:
                  applicationSettings.setupCompletedByUserId,
                initialWorkspaceId: applicationSettings.initialWorkspaceId,
              })
          : await tx
              .insert(applicationSettings)
              .values({
                setupCompletedAt: new Date(),
                setupCompletedByUserId: ctx.session.user.id,
                initialWorkspaceId: createdWorkspace.id,
              })
              .returning({
                id: applicationSettings.id,
                setupCompletedAt: applicationSettings.setupCompletedAt,
                setupCompletedByUserId:
                  applicationSettings.setupCompletedByUserId,
                initialWorkspaceId: applicationSettings.initialWorkspaceId,
              });

        return {
          setupCompleted: true,
          settings,
          workspace: createdWorkspace,
        };
      });
    }),

  /**
   * Get dashboard statistics
   */
  stats: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.select().from(user);
    const workspaces = await ctx.db.select().from(workspace);
    const totalUsers = users.length;
    const adminUsers = users.filter((u) => u.role === "admin").length;

    return {
      totalUsers,
      totalWorkspaces: workspaces.length,
      adminUsers,
      regularUsers: totalUsers - adminUsers,
    };
  }),

  listWorkspaces: adminProcedure.query(async ({ ctx }) => {
    const workspaces = await ctx.db
      .select()
      .from(workspace)
      .orderBy(workspace.createdAt);
    const memberships = await ctx.db.select().from(workspaceMembership);

    return workspaces.map((entry) => ({
      id: entry.id,
      name: entry.name,
      slug: entry.slug,
      ownerUserId: entry.ownerUserId,
      membershipCount: memberships.filter(
        (membership) => membership.workspaceId === entry.id,
      ).length,
      createdAt: entry.createdAt,
    }));
  }),

  /**
   * List all users with pagination
   */
  listUsers: adminProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(20),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;

      const users = await ctx.db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          image: user.image,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
        })
        .from(user)
        .limit(limit)
        .offset(offset)
        .orderBy(user.createdAt);

      const [countResult] = await ctx.db.select({ count: user.id }).from(user);

      return {
        users,
        total: countResult ? users.length : 0,
        hasMore: users.length === limit,
      };
    }),

  /**
   * Update a user's role
   */
  updateUserRole: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(userRoleEnum),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Prevent admin from demoting themselves
      if (input.userId === ctx.session.user.id && input.role !== "admin") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot remove your own admin privileges",
        });
      }

      const [updated] = await ctx.db
        .update(user)
        .set({ role: input.role })
        .where(eq(user.id, input.userId))
        .returning({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        });

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return updated;
    }),

  /**
   * Get a specific user by ID
   */
  getUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [foundUser] = await ctx.db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          image: user.image,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1);

      if (!foundUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return foundUser;
    }),
} satisfies TRPCRouterRecord;
