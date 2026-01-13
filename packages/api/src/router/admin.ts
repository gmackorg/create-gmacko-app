import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { eq } from "@gmacko/db";
import { user, userRoleEnum } from "@gmacko/db/schema";

import { protectedProcedure } from "../trpc";

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

  if (!dbUser || dbUser.role !== "admin") {
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
