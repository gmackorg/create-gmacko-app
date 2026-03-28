import { canManageWorkspace, isPlatformAdminRole } from "@gmacko/auth";
import { integrations, platformPrimitives, saasFeatures } from "@gmacko/config";
import { and, eq, isNull } from "@gmacko/db";
import {
  apiKeys,
  billingPlanLimit,
  UpdateUserPreferencesSchema,
  user,
  userPreferences,
  waitlistEntry,
  workspace,
  workspaceInviteAllowlist,
  workspaceMembership,
  workspaceSubscription,
  workspaceUsageRollup,
} from "@gmacko/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { createHash, randomBytes } from "crypto";
import { z } from "zod/v4";

import type { createTRPCContext } from "../trpc";
import { protectedProcedure, publicProcedure } from "../trpc";

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

function getDefaultUsagePeriod() {
  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );

  return { periodStart, periodEnd };
}

function getLaunchDefaults() {
  const signupEnabled = true;
  const maintenanceMode = false;
  const isProduction = process.env.NODE_ENV === "production";

  return {
    allowedEmailDomains: [] as string[],
    announcementMessage: null as string | null,
    announcementTone: "info" as const,
    canAutoCreateAccounts: !isProduction,
    maintenanceMode,
    signupEnabled,
    inviteOnly: !signupEnabled,
    isProduction,
  };
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
  getLaunchState: publicProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.query.applicationSettings.findFirst();
    const defaults = getLaunchDefaults();

    return {
      announcementMessage:
        settings?.announcementMessage ?? defaults.announcementMessage,
      announcementTone: settings?.announcementTone ?? defaults.announcementTone,
      allowedEmailDomains: settings?.allowedEmailDomains ?? [],
      canAutoCreateAccounts: defaults.canAutoCreateAccounts,
      inviteOnly: !(settings?.signupEnabled ?? defaults.signupEnabled),
      maintenanceMode: settings?.maintenanceMode ?? defaults.maintenanceMode,
      signupEnabled: settings?.signupEnabled ?? defaults.signupEnabled,
      stripeConfigured: integrations.stripe,
      publicAnnouncementVisible: Boolean(
        settings?.announcementMessage ?? defaults.announcementMessage,
      ),
      canUseWaitlist: true,
    };
  }),

  submitWaitlistEntry: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        message: z.string().max(1000).optional(),
        referralCode: z.string().max(120).optional(),
        source: z
          .enum(["landing", "contact", "referral", "blocked-signup"])
          .default("landing"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      const [existing] = await ctx.db
        .select({ id: waitlistEntry.id })
        .from(waitlistEntry)
        .where(
          and(
            eq(waitlistEntry.email, email),
            eq(waitlistEntry.source, input.source),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await ctx.db
          .update(waitlistEntry)
          .set({
            message: input.message ?? null,
            referralCode: input.referralCode ?? null,
            status: "pending",
          })
          .where(eq(waitlistEntry.id, existing.id))
          .returning({
            id: waitlistEntry.id,
            email: waitlistEntry.email,
            source: waitlistEntry.source,
            status: waitlistEntry.status,
          });

        return updated ?? existing;
      }

      const [created] = await ctx.db
        .insert(waitlistEntry)
        .values({
          email,
          message: input.message ?? null,
          referralCode: input.referralCode ?? null,
          source: input.source,
          status: "pending",
        })
        .returning({
          id: waitlistEntry.id,
          email: waitlistEntry.email,
          source: waitlistEntry.source,
          status: waitlistEntry.status,
        });

      return created;
    }),

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

  getPlatformPrimitives: protectedProcedure.query(() => {
    return {
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
    };
  }),

  getBillingOverview: protectedProcedure.query(async ({ ctx }) => {
    const workspaceScope = await getWorkspaceScope(ctx);

    if (
      !workspaceScope.currentWorkspaceId ||
      !workspaceScope.currentWorkspace
    ) {
      return {
        billing: {
          customerPortalAvailable: false,
          plan: null,
          plans: [],
          providerConfigured: integrations.stripe,
          subscription: null,
          visible: false,
        },
        usage: {
          currentPeriodEnd: null,
          currentPeriodStart: null,
          limits: [],
          meters: [],
          visible: false,
        },
      };
    }

    const billingVisible = saasFeatures.billing;
    const usageVisible = saasFeatures.billing || saasFeatures.metering;

    const [plans, subscription, meters, rollups] = await Promise.all([
      ctx.db.query.billingPlan.findMany({
        orderBy: (plan, { asc }) => [asc(plan.amountInCents), asc(plan.name)],
      }),
      ctx.db.query.workspaceSubscription.findFirst({
        where: eq(
          workspaceSubscription.workspaceId,
          workspaceScope.currentWorkspaceId,
        ),
      }),
      ctx.db.query.usageMeter.findMany({
        orderBy: (meter, { asc }) => [asc(meter.name), asc(meter.key)],
      }),
      ctx.db.query.workspaceUsageRollup.findMany({
        where: eq(
          workspaceUsageRollup.workspaceId,
          workspaceScope.currentWorkspaceId,
        ),
        orderBy: (rollup, { desc }) => [
          desc(rollup.periodEnd),
          desc(rollup.createdAt),
        ],
      }),
    ]);

    const currentPlan =
      (subscription?.planId
        ? plans.find((plan) => plan.id === subscription.planId)
        : null) ??
      plans.find((plan) => plan.isDefault) ??
      plans[0] ??
      null;

    const planLimits = currentPlan
      ? await ctx.db.query.billingPlanLimit.findMany({
          where: eq(billingPlanLimit.planId, currentPlan.id),
          orderBy: (limit, { asc }) => [asc(limit.key)],
        })
      : [];

    const latestRollupByMeterId = new Map<string, (typeof rollups)[number]>();
    for (const rollup of rollups) {
      if (!latestRollupByMeterId.has(rollup.meterId)) {
        latestRollupByMeterId.set(rollup.meterId, rollup);
      }
    }

    const fallbackPeriod = getDefaultUsagePeriod();
    const activePeriodStart =
      subscription?.currentPeriodStart ?? fallbackPeriod.periodStart;
    const activePeriodEnd =
      subscription?.currentPeriodEnd ?? fallbackPeriod.periodEnd;

    return {
      billing: {
        customerPortalAvailable:
          integrations.stripe && Boolean(subscription?.stripeCustomerId),
        plan: currentPlan
          ? {
              amountInCents: currentPlan.amountInCents,
              currency: currentPlan.currency,
              description: currentPlan.description,
              id: currentPlan.id,
              interval: currentPlan.interval,
              key: currentPlan.key,
              name: currentPlan.name,
            }
          : null,
        plans: plans.map((plan) => ({
          amountInCents: plan.amountInCents,
          currency: plan.currency,
          id: plan.id,
          interval: plan.interval,
          isDefault: plan.isDefault,
          key: plan.key,
          name: plan.name,
        })),
        providerConfigured: integrations.stripe,
        subscription: subscription
          ? {
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              currentPeriodEnd: subscription.currentPeriodEnd,
              currentPeriodStart: subscription.currentPeriodStart,
              provider: subscription.provider,
              status: subscription.status,
            }
          : null,
        visible: billingVisible,
      },
      usage: {
        currentPeriodEnd: activePeriodEnd,
        currentPeriodStart: activePeriodStart,
        limits: planLimits.map((limit) => {
          const matchingMeter = meters.find((meter) => meter.key === limit.key);
          const currentUsage = matchingMeter
            ? (latestRollupByMeterId.get(matchingMeter.id)?.quantity ?? 0)
            : 0;

          return {
            currentUsage,
            key: limit.key,
            period: limit.period,
            value: limit.value,
          };
        }),
        meters: meters.map((meter) => {
          const latestRollup = latestRollupByMeterId.get(meter.id);

          return {
            aggregation: meter.aggregation,
            currentUsage: latestRollup?.quantity ?? 0,
            key: meter.key,
            latestPeriodEnd: latestRollup?.periodEnd ?? activePeriodEnd,
            latestPeriodStart: latestRollup?.periodStart ?? activePeriodStart,
            name: meter.name,
            unit: meter.unit,
          };
        }),
        visible: usageVisible,
      },
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
