import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { UserId } from "../auth";
import {
  ApiKey,
  ApiKeyCreated,
  ApiKeyId,
  BillingOverview,
  BillingPlan,
  BillingPlanId,
  BillingPlanLimit,
  BillingPlanLimitId,
  CreateApiKey,
  CreateApiKeyForm,
  CreateInvite,
  CreateInviteForm,
  InviteAccepted,
  InviteId,
  LaunchState,
  PlatformPrimitives,
  SettingsApi,
  UpdatePreferences,
  UpdatePreferencesForm,
  UsageMeter,
  UsageMeterId,
  UsageRollup,
  UsageRollupId,
  UserPreferences,
  UserPreferencesId,
  WaitlistEntry,
  WaitlistEntryId,
  WaitlistSubmission,
  WaitlistSubmit,
  WaitlistSubmitForm,
  Workspace,
  WorkspaceContext,
  WorkspaceId,
  WorkspaceInvite,
  WorkspaceMembership,
  WorkspaceMembershipId,
  WorkspaceSubscription,
  WorkspaceSubscriptionId,
} from "../settings";
import { inspectGroup, json, roundTrip, routeTable } from "./helpers";

const at = (iso: string) => new Date(iso);
const t0 = at("2026-01-01T00:00:00.000Z");
const t1 = at("2026-01-02T00:00:00.000Z");
const userId = UserId.make("u1");
const workspaceId = WorkspaceId.make("w1");

describe("payloads", () => {
  it("UpdatePreferences decodes only the fields sent (no defaults)", () => {
    const decoded = json(UpdatePreferences).decode({
      emailNotifications: false,
    });
    expect(Object.keys(decoded)).toEqual(["emailNotifications"]);
    expect(decoded.emailNotifications).toBe(false);
    expect(Object.keys(new UpdatePreferences({}))).toEqual([]);
    expect(() => new UpdatePreferences({ theme: "sepia" as never })).toThrow();
    expect(() => new UpdatePreferences({ language: "x".repeat(11) })).toThrow();
    expect(() => new UpdatePreferences({ timezone: "x".repeat(51) })).toThrow();
    expect(UpdatePreferencesForm["~standard"].vendor).toBe("effect");
  });

  it("WaitlistSubmit defaults the source and bounds the free text", () => {
    const decoded = json(WaitlistSubmit).decode({ email: "ada@example.com" });
    expect(decoded.source).toBe("landing");
    expect(decoded.message).toBeUndefined();
    expect(
      () =>
        new WaitlistSubmit({
          email: "ada@example.com",
          source: "contact",
          message: "x".repeat(1001),
        }),
    ).toThrow();
    expect(
      () =>
        new WaitlistSubmit({
          email: "ada@example.com",
          source: "contact",
          referralCode: "x".repeat(121),
        }),
    ).toThrow();
    expect(
      () => new WaitlistSubmit({ email: "nope", source: "landing" }),
    ).toThrow();
    expect(WaitlistSubmitForm["~standard"].vendor).toBe("effect");
  });

  it("CreateApiKey needs a name, at least one scope and a positive integer expiry", () => {
    expect(
      () => new CreateApiKey({ name: "", permissions: ["read"] }),
    ).toThrow();
    expect(
      () => new CreateApiKey({ name: "ci", permissions: [] as never }),
    ).toThrow();
    expect(
      () =>
        new CreateApiKey({
          name: "ci",
          permissions: ["read"],
          expiresInDays: 0,
        }),
    ).toThrow();
    expect(
      () =>
        new CreateApiKey({
          name: "ci",
          permissions: ["read"],
          expiresInDays: 1.5,
        }),
    ).toThrow();
    expect(
      () => new CreateApiKey({ name: "x".repeat(101), permissions: ["read"] }),
    ).toThrow();
    const key = new CreateApiKey({
      name: "ci",
      permissions: ["read", "write"],
    });
    expect(key.expiresInDays).toBeUndefined();
    expect(CreateApiKeyForm["~standard"].vendor).toBe("effect");
  });

  it("CreateInvite defaults the role to member and never allows owner", () => {
    expect(json(CreateInvite).decode({ email: "bob@example.com" }).role).toBe(
      "member",
    );
    expect(() =>
      json(CreateInvite).decode({ email: "bob@example.com", role: "owner" }),
    ).toThrow();
    expect(CreateInviteForm["~standard"].vendor).toBe("effect");
  });
});

describe("row models round-trip through JSON", () => {
  it.each<[string, Schema.Top, unknown]>([
    [
      "UserPreferences",
      UserPreferences,
      new UserPreferences({
        id: UserPreferencesId.make("pref1"),
        userId,
        theme: "dark",
        language: "en",
        timezone: "UTC",
        emailNotifications: true,
        pushNotifications: false,
        createdAt: t0,
        updatedAt: null,
      }),
    ],
    [
      "ApiKey",
      ApiKey,
      new ApiKey({
        id: ApiKeyId.make("k1"),
        name: "ci",
        keyPrefix: "gmk_abcdefgh",
        permissions: ["read", "write"],
        lastUsedAt: null,
        expiresAt: t1,
        createdAt: t0,
      }),
    ],
    [
      "ApiKeyCreated",
      ApiKeyCreated,
      new ApiKeyCreated({
        id: ApiKeyId.make("k1"),
        name: "ci",
        keyPrefix: "gmk_abcdefgh",
        permissions: ["admin"],
        expiresAt: null,
        key: "gmk_abcdefghijklmnop",
      }),
    ],
    [
      "Workspace",
      Workspace,
      new Workspace({
        id: workspaceId,
        name: "Acme",
        slug: "acme",
        ownerUserId: userId,
        createdAt: t0,
        updatedAt: t1,
      }),
    ],
    [
      "WorkspaceMembership",
      WorkspaceMembership,
      new WorkspaceMembership({
        id: WorkspaceMembershipId.make("m1"),
        workspaceId,
        userId,
        role: "owner",
        createdAt: t0,
        updatedAt: null,
      }),
    ],
    [
      "WorkspaceInvite",
      WorkspaceInvite,
      new WorkspaceInvite({
        id: InviteId.make("i1"),
        workspaceId,
        email: "bob@example.com",
        role: "member",
        invitedByUserId: userId,
        createdAt: t0,
        updatedAt: null,
      }),
    ],
    [
      "WaitlistEntry",
      WaitlistEntry,
      new WaitlistEntry({
        id: WaitlistEntryId.make("wl1"),
        email: "eve@example.com",
        source: "blocked-signup",
        status: "pending",
        message: null,
        referralCode: "friend",
        reviewedByUserId: null,
        reviewedAt: null,
        createdAt: t0,
        updatedAt: null,
      }),
    ],
    [
      "BillingPlan",
      BillingPlan,
      new BillingPlan({
        id: BillingPlanId.make("plan1"),
        key: "pro",
        name: "Pro",
        description: null,
        interval: "month",
        amountInCents: 1200,
        currency: "usd",
        isDefault: false,
        active: true,
        createdAt: t0,
        updatedAt: null,
      }),
    ],
    [
      "BillingPlanLimit",
      BillingPlanLimit,
      new BillingPlanLimit({
        id: BillingPlanLimitId.make("lim1"),
        planId: BillingPlanId.make("plan1"),
        key: "posts",
        value: null,
        period: "all_time",
        createdAt: t0,
        updatedAt: null,
      }),
    ],
    [
      "WorkspaceSubscription",
      WorkspaceSubscription,
      new WorkspaceSubscription({
        id: WorkspaceSubscriptionId.make("sub1"),
        workspaceId,
        planId: null,
        status: "trialing",
        provider: "manual",
        currentPeriodStart: t0,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        createdAt: t0,
        updatedAt: null,
      }),
    ],
    [
      "UsageMeter",
      UsageMeter,
      new UsageMeter({
        id: UsageMeterId.make("meter1"),
        key: "posts",
        name: "Posts",
        description: null,
        aggregation: "sum",
        unit: "count",
        createdAt: t0,
        updatedAt: null,
      }),
    ],
    [
      "UsageRollup",
      UsageRollup,
      new UsageRollup({
        id: UsageRollupId.make("roll1"),
        workspaceId,
        meterId: UsageMeterId.make("meter1"),
        periodStart: t0,
        periodEnd: t1,
        quantity: 3,
        createdAt: t0,
        updatedAt: null,
      }),
    ],
    [
      "LaunchState",
      LaunchState,
      new LaunchState({
        announcementMessage: null,
        announcementTone: "info",
        allowedEmailDomains: [],
        canAutoCreateAccounts: true,
        inviteOnly: false,
        maintenanceMode: false,
        signupEnabled: true,
        stripeConfigured: false,
        publicAnnouncementVisible: false,
        canUseWaitlist: true,
      }),
    ],
    [
      "WaitlistSubmission",
      WaitlistSubmission,
      new WaitlistSubmission({
        id: WaitlistEntryId.make("wl1"),
        email: "eve@example.com",
        source: "landing",
        status: "pending",
      }),
    ],
    [
      "WorkspaceContext",
      WorkspaceContext,
      new WorkspaceContext({
        workspace: { id: workspaceId, name: "Acme", slug: "acme" },
        workspaceRole: "admin",
        platformRole: "user",
        canManageWorkspace: true,
        isPlatformAdmin: false,
        inviteAllowlistCount: 2,
      }),
    ],
    [
      "PlatformPrimitives",
      PlatformPrimitives,
      new PlatformPrimitives({
        featureFlags: { enabled: true, provider: "local" },
        jobs: { enabled: false, provider: "local" },
        rateLimits: { enabled: true, scopes: ["auth", "contact"] },
        botProtection: { enabled: true, provider: "local-rate-limit" },
        compliance: { enabled: true, dataExport: false, dataDeletion: true },
        emailDelivery: {
          enabled: false,
          provider: "none",
          requiredEnv: ["RESEND_API_KEY"],
        },
      }),
    ],
    [
      "BillingOverview",
      BillingOverview,
      new BillingOverview({
        billing: {
          customerPortalAvailable: false,
          plan: {
            amountInCents: 0,
            currency: "usd",
            description: null,
            id: BillingPlanId.make("plan0"),
            interval: "month",
            key: "free",
            name: "Free",
          },
          plans: [
            {
              amountInCents: 0,
              currency: "usd",
              id: BillingPlanId.make("plan0"),
              interval: "month",
              isDefault: true,
              key: "free",
              name: "Free",
            },
          ],
          providerConfigured: false,
          subscription: {
            cancelAtPeriodEnd: false,
            currentPeriodEnd: null,
            currentPeriodStart: t0,
            provider: "manual",
            status: "free",
          },
          visible: true,
        },
        usage: {
          currentPeriodEnd: t1,
          currentPeriodStart: t0,
          limits: [
            { currentUsage: 1, key: "posts", period: "month", value: 10 },
          ],
          meters: [
            {
              aggregation: "sum",
              currentUsage: 1,
              key: "posts",
              latestPeriodEnd: t1,
              latestPeriodStart: t0,
              name: "Posts",
              unit: "count",
            },
          ],
          visible: true,
        },
      }),
    ],
    [
      "InviteAccepted",
      InviteAccepted,
      new InviteAccepted({ workspaceId, role: "member" }),
    ],
  ])("%s", (_name, schema, value) => {
    expect(
      roundTrip(
        schema as unknown as Schema.ConstraintCodec<
          unknown,
          unknown,
          never,
          never
        >,
        value,
      ),
    ).toEqual(value);
  });
});

describe("SettingsApi", () => {
  it("declares the fourteen settings endpoints with their credentials", () => {
    const credentialErrors = ["401 Unauthorized", "403 Forbidden"];
    expect(routeTable(inspectGroup(SettingsApi))).toEqual([
      {
        id: "launchState",
        method: "GET",
        path: "/launch-state",
        credential: "public",
        roles: [],
        success: 200,
        errors: [],
      },
      {
        id: "submitWaitlistEntry",
        method: "POST",
        path: "/waitlist",
        credential: "public",
        roles: [],
        success: 201,
        errors: ["429 RateLimited"],
      },
      {
        id: "workspaceContext",
        method: "GET",
        path: "/workspace",
        credential: "SessionOrKey(read)",
        roles: [],
        success: 200,
        errors: credentialErrors,
      },
      {
        id: "platformPrimitives",
        method: "GET",
        path: "/platform-primitives",
        credential: "SessionOrKey(read)",
        roles: [],
        success: 200,
        errors: credentialErrors,
      },
      {
        id: "billingOverview",
        method: "GET",
        path: "/billing",
        credential: "SessionOrKey(read)",
        roles: [],
        success: 200,
        errors: credentialErrors,
      },
      {
        id: "listInvites",
        method: "GET",
        path: "/workspace/invites",
        credential: "SessionOrKey(read)",
        roles: ["WorkspaceRole(admin)"],
        success: 200,
        errors: credentialErrors,
      },
      {
        id: "createInvite",
        method: "POST",
        path: "/workspace/invites",
        credential: "SessionOrKey(write)",
        roles: ["WorkspaceRole(admin)"],
        success: 201,
        errors: [...credentialErrors, "409 Conflict"],
      },
      {
        id: "acceptInvite",
        method: "POST",
        path: "/workspace/invites/:inviteId/accept",
        credential: "SessionOrKey(write)",
        roles: [],
        success: 200,
        errors: [...credentialErrors, "404 NotFound", "409 Conflict"],
      },
      {
        id: "getPreferences",
        method: "GET",
        path: "/preferences",
        credential: "SessionOrKey(read)",
        roles: [],
        success: 200,
        errors: credentialErrors,
      },
      {
        id: "updatePreferences",
        method: "PATCH",
        path: "/preferences",
        credential: "SessionOrKey(write)",
        roles: [],
        success: 200,
        errors: credentialErrors,
      },
      {
        id: "listApiKeys",
        method: "GET",
        path: "/api-keys",
        credential: "SessionOrKey(read)",
        roles: [],
        success: 200,
        errors: credentialErrors,
      },
      {
        id: "createApiKey",
        method: "POST",
        path: "/api-keys",
        credential: "SessionOrKey(admin)",
        roles: [],
        success: 201,
        errors: credentialErrors,
      },
      {
        id: "revokeApiKey",
        method: "DELETE",
        path: "/api-keys/:id",
        credential: "SessionOrKey(admin)",
        roles: [],
        success: 204,
        errors: [...credentialErrors, "404 NotFound"],
      },
      {
        id: "deleteAccount",
        method: "DELETE",
        path: "/account",
        credential: "Session",
        roles: [],
        success: 204,
        errors: credentialErrors,
      },
    ]);
  });
});
