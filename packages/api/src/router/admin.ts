import { eq } from "@gmacko/db";
import {
  applicationSettings,
  user,
  userRoleEnum,
  workspace,
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

  if (dbUser?.role !== "admin") {
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
    const totalUsers = users.length;
    const adminUsers = users.filter((u) => u.role === "admin").length;

    return {
      totalUsers,
      adminUsers,
      regularUsers: totalUsers - adminUsers,
    };
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
