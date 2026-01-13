import { createHash, randomBytes } from "crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq, isNull } from "@gmacko/db";
import {
  apiKeys,
  UpdateUserPreferencesSchema,
  userPreferences,
} from "@gmacko/db/schema";

import { protectedProcedure } from "../trpc";

function generateApiKey(): string {
  return `gmk_${randomBytes(32).toString("base64url")}`;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function getKeyPrefix(key: string): string {
  return key.substring(0, 12);
}

export const settingsRouter = {
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
} satisfies TRPCRouterRecord;
