/**
 * Everything a signed-in user (or an operator key) reads and writes about
 * their own account, workspace and billing, plus the public launch state and
 * waitlist. Row models mirror @gmacko/db's tables one to one; response
 * shapes mirror what the tRPC procedures returned, typed where they were
 * `string`.
 */
import { Effect, Schema } from "effect";

import { UserId } from "../auth/models";
import { boundedString, Email, id, stringBetween } from "../primitives";
import { ApiKeyScope, UserRole, WorkspaceMemberRole } from "../roles";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const WaitlistSource = Schema.Literals([
  "landing",
  "contact",
  "referral",
  "blocked-signup",
]);
export type WaitlistSource = typeof WaitlistSource.Type;

export const WaitlistStatus = Schema.Literals([
  "pending",
  "contacted",
  "approved",
  "dismissed",
]);
export type WaitlistStatus = typeof WaitlistStatus.Type;

export const BillingInterval = Schema.Literals(["month", "year"]);
export type BillingInterval = typeof BillingInterval.Type;

export const WorkspaceSubscriptionStatus = Schema.Literals([
  "free",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
]);
export type WorkspaceSubscriptionStatus =
  typeof WorkspaceSubscriptionStatus.Type;

export const BillingProvider = Schema.Literals(["manual", "stripe"]);
export type BillingProvider = typeof BillingProvider.Type;

export const BillingLimitPeriod = Schema.Literals(["day", "month", "all_time"]);
export type BillingLimitPeriod = typeof BillingLimitPeriod.Type;

export const UsageAggregation = Schema.Literals(["sum", "max"]);
export type UsageAggregation = typeof UsageAggregation.Type;

export const AnnouncementTone = Schema.Literals([
  "info",
  "warning",
  "critical",
]);
export type AnnouncementTone = typeof AnnouncementTone.Type;

export const Theme = Schema.Literals(["light", "dark", "system"]);
export type Theme = typeof Theme.Type;

/** The roles an invite may grant; owners are never invited. */
export const InviteRole = Schema.Literals(["admin", "member"]);
export type InviteRole = typeof InviteRole.Type;

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

export const WorkspaceId = id("WorkspaceId");
export type WorkspaceId = typeof WorkspaceId.Type;
export const WorkspaceMembershipId = id("WorkspaceMembershipId");
export type WorkspaceMembershipId = typeof WorkspaceMembershipId.Type;
export const InviteId = id("InviteId");
export type InviteId = typeof InviteId.Type;
export const UserPreferencesId = id("UserPreferencesId");
export type UserPreferencesId = typeof UserPreferencesId.Type;
export const ApiKeyId = id("ApiKeyId");
export type ApiKeyId = typeof ApiKeyId.Type;
export const WaitlistEntryId = id("WaitlistEntryId");
export type WaitlistEntryId = typeof WaitlistEntryId.Type;
export const BillingPlanId = id("BillingPlanId");
export type BillingPlanId = typeof BillingPlanId.Type;
export const BillingPlanLimitId = id("BillingPlanLimitId");
export type BillingPlanLimitId = typeof BillingPlanLimitId.Type;
export const WorkspaceSubscriptionId = id("WorkspaceSubscriptionId");
export type WorkspaceSubscriptionId = typeof WorkspaceSubscriptionId.Type;
export const UsageMeterId = id("UsageMeterId");
export type UsageMeterId = typeof UsageMeterId.Type;
export const UsageRollupId = id("UsageRollupId");
export type UsageRollupId = typeof UsageRollupId.Type;

/** `createdAt` set on insert, `updatedAt` only once a row has been updated. */
const timestamps = {
  createdAt: Schema.Date,
  updatedAt: Schema.NullOr(Schema.Date),
} as const;

// ---------------------------------------------------------------------------
// Row models
// ---------------------------------------------------------------------------

export class UserPreferences extends Schema.Class<UserPreferences>(
  "UserPreferences",
)({
  id: UserPreferencesId,
  userId: UserId,
  theme: Theme,
  language: Schema.String,
  timezone: Schema.String,
  emailNotifications: Schema.Boolean,
  pushNotifications: Schema.Boolean,
  ...timestamps,
}) {}

/** An API key as listed: never the hash, never the plaintext. */
export class ApiKey extends Schema.Class<ApiKey>("ApiKey")({
  id: ApiKeyId,
  name: Schema.String,
  /** First 12 characters of the key, for recognising it in a list. */
  keyPrefix: Schema.String,
  permissions: Schema.Array(ApiKeyScope),
  lastUsedAt: Schema.NullOr(Schema.Date),
  expiresAt: Schema.NullOr(Schema.Date),
  createdAt: Schema.Date,
}) {}

/** The one response that carries the plaintext key; shown once, never stored. */
export class ApiKeyCreated extends Schema.Class<ApiKeyCreated>("ApiKeyCreated")(
  {
    id: ApiKeyId,
    name: Schema.String,
    keyPrefix: Schema.String,
    permissions: Schema.Array(ApiKeyScope),
    expiresAt: Schema.NullOr(Schema.Date),
    key: Schema.String,
  },
) {}

export class Workspace extends Schema.Class<Workspace>("Workspace")({
  id: WorkspaceId,
  name: Schema.String,
  slug: Schema.String,
  ownerUserId: UserId,
  ...timestamps,
}) {}

export class WorkspaceMembership extends Schema.Class<WorkspaceMembership>(
  "WorkspaceMembership",
)({
  id: WorkspaceMembershipId,
  workspaceId: WorkspaceId,
  userId: UserId,
  role: WorkspaceMemberRole,
  ...timestamps,
}) {}

/** An allowlist entry: the email may sign up and joins the workspace with `role`. */
export class WorkspaceInvite extends Schema.Class<WorkspaceInvite>(
  "WorkspaceInvite",
)({
  id: InviteId,
  workspaceId: WorkspaceId,
  email: Schema.String,
  role: WorkspaceMemberRole,
  invitedByUserId: UserId,
  ...timestamps,
}) {}

export class WaitlistEntry extends Schema.Class<WaitlistEntry>("WaitlistEntry")(
  {
    id: WaitlistEntryId,
    email: Schema.String,
    source: WaitlistSource,
    status: WaitlistStatus,
    message: Schema.NullOr(Schema.String),
    referralCode: Schema.NullOr(Schema.String),
    reviewedByUserId: Schema.NullOr(UserId),
    reviewedAt: Schema.NullOr(Schema.Date),
    ...timestamps,
  },
) {}

export class BillingPlan extends Schema.Class<BillingPlan>("BillingPlan")({
  id: BillingPlanId,
  key: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  interval: BillingInterval,
  amountInCents: Schema.Int,
  currency: Schema.String,
  isDefault: Schema.Boolean,
  active: Schema.Boolean,
  ...timestamps,
}) {}

export class BillingPlanLimit extends Schema.Class<BillingPlanLimit>(
  "BillingPlanLimit",
)({
  id: BillingPlanLimitId,
  planId: BillingPlanId,
  key: Schema.String,
  /** `null` means unlimited. */
  value: Schema.NullOr(Schema.Int),
  period: BillingLimitPeriod,
  ...timestamps,
}) {}

/** The Stripe customer/subscription ids stay server-side; `customerPortalAvailable` is derived from them. */
export class WorkspaceSubscription extends Schema.Class<WorkspaceSubscription>(
  "WorkspaceSubscription",
)({
  id: WorkspaceSubscriptionId,
  workspaceId: WorkspaceId,
  planId: Schema.NullOr(BillingPlanId),
  status: WorkspaceSubscriptionStatus,
  provider: BillingProvider,
  currentPeriodStart: Schema.NullOr(Schema.Date),
  currentPeriodEnd: Schema.NullOr(Schema.Date),
  cancelAtPeriodEnd: Schema.Boolean,
  ...timestamps,
}) {}

export class UsageMeter extends Schema.Class<UsageMeter>("UsageMeter")({
  id: UsageMeterId,
  key: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  aggregation: UsageAggregation,
  unit: Schema.String,
  ...timestamps,
}) {}

export class UsageRollup extends Schema.Class<UsageRollup>("UsageRollup")({
  id: UsageRollupId,
  workspaceId: WorkspaceId,
  meterId: UsageMeterId,
  periodStart: Schema.Date,
  periodEnd: Schema.Date,
  quantity: Schema.Int,
  ...timestamps,
}) {}

// ---------------------------------------------------------------------------
// Launch state and waitlist (public)
// ---------------------------------------------------------------------------

export class LaunchState extends Schema.Class<LaunchState>("LaunchState")({
  announcementMessage: Schema.NullOr(Schema.String),
  announcementTone: AnnouncementTone,
  allowedEmailDomains: Schema.Array(Schema.String),
  /** `stage !== "production"`. */
  canAutoCreateAccounts: Schema.Boolean,
  /** `!signupEnabled`. */
  inviteOnly: Schema.Boolean,
  maintenanceMode: Schema.Boolean,
  signupEnabled: Schema.Boolean,
  stripeConfigured: Schema.Boolean,
  publicAnnouncementVisible: Schema.Boolean,
  canUseWaitlist: Schema.Boolean,
}) {}

export class WaitlistSubmit extends Schema.Class<WaitlistSubmit>(
  "WaitlistSubmit",
)({
  email: Email,
  message: Schema.optionalKey(boundedString(1000)),
  referralCode: Schema.optionalKey(boundedString(120)),
  source: WaitlistSource.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("landing" as const)),
  ),
}) {}

/** Standard Schema view for TanStack Form validators. */
export const WaitlistSubmitForm = Schema.toStandardSchemaV1(WaitlistSubmit);

export class WaitlistSubmission extends Schema.Class<WaitlistSubmission>(
  "WaitlistSubmission",
)({
  id: WaitlistEntryId,
  email: Schema.String,
  source: WaitlistSource,
  status: WaitlistStatus,
}) {}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export const WorkspaceSummary = Schema.Struct({
  id: WorkspaceId,
  name: Schema.String,
  slug: Schema.String,
});

/**
 * The caller's current workspace: their earliest membership, or the initial
 * workspace when they have none (then `workspaceRole` is `null`).
 */
export class WorkspaceContext extends Schema.Class<WorkspaceContext>(
  "WorkspaceContext",
)({
  workspace: Schema.NullOr(WorkspaceSummary),
  workspaceRole: Schema.NullOr(WorkspaceMemberRole),
  platformRole: UserRole,
  canManageWorkspace: Schema.Boolean,
  isPlatformAdmin: Schema.Boolean,
  inviteAllowlistCount: Schema.Int,
}) {}

export class CreateInvite extends Schema.Class<CreateInvite>("CreateInvite")({
  email: Email,
  role: InviteRole.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("member" as const)),
  ),
}) {}

/** Standard Schema view for TanStack Form validators. */
export const CreateInviteForm = Schema.toStandardSchemaV1(CreateInvite);

export class InviteAccepted extends Schema.Class<InviteAccepted>(
  "InviteAccepted",
)({
  workspaceId: WorkspaceId,
  role: WorkspaceMemberRole,
}) {}

// ---------------------------------------------------------------------------
// Platform primitives and billing
// ---------------------------------------------------------------------------

export class PlatformPrimitives extends Schema.Class<PlatformPrimitives>(
  "PlatformPrimitives",
)({
  featureFlags: Schema.Struct({
    enabled: Schema.Boolean,
    provider: Schema.Literal("local"),
  }),
  jobs: Schema.Struct({
    enabled: Schema.Boolean,
    provider: Schema.Literal("local"),
  }),
  rateLimits: Schema.Struct({
    enabled: Schema.Boolean,
    scopes: Schema.Array(Schema.String),
  }),
  botProtection: Schema.Struct({
    enabled: Schema.Boolean,
    provider: Schema.Literal("local-rate-limit"),
  }),
  compliance: Schema.Struct({
    enabled: Schema.Boolean,
    dataExport: Schema.Boolean,
    dataDeletion: Schema.Boolean,
  }),
  emailDelivery: Schema.Struct({
    enabled: Schema.Boolean,
    provider: Schema.Literals(["resend", "sendgrid", "none"]),
    requiredEnv: Schema.Array(Schema.String),
  }),
}) {}

export const BillingPlanSummary = Schema.Struct({
  amountInCents: Schema.Int,
  currency: Schema.String,
  description: Schema.NullOr(Schema.String),
  id: BillingPlanId,
  interval: BillingInterval,
  key: Schema.String,
  name: Schema.String,
});

export const BillingPlanOption = Schema.Struct({
  amountInCents: Schema.Int,
  currency: Schema.String,
  id: BillingPlanId,
  interval: BillingInterval,
  isDefault: Schema.Boolean,
  key: Schema.String,
  name: Schema.String,
});

export const SubscriptionSummary = Schema.Struct({
  cancelAtPeriodEnd: Schema.Boolean,
  currentPeriodEnd: Schema.NullOr(Schema.Date),
  currentPeriodStart: Schema.NullOr(Schema.Date),
  provider: BillingProvider,
  status: WorkspaceSubscriptionStatus,
});

export const UsageLimit = Schema.Struct({
  currentUsage: Schema.Number,
  key: Schema.String,
  period: BillingLimitPeriod,
  value: Schema.NullOr(Schema.Number),
});

export const UsageMeterReading = Schema.Struct({
  aggregation: UsageAggregation,
  currentUsage: Schema.Number,
  key: Schema.String,
  latestPeriodEnd: Schema.NullOr(Schema.Date),
  latestPeriodStart: Schema.NullOr(Schema.Date),
  name: Schema.String,
  unit: Schema.String,
});

export class BillingOverview extends Schema.Class<BillingOverview>(
  "BillingOverview",
)({
  billing: Schema.Struct({
    customerPortalAvailable: Schema.Boolean,
    plan: Schema.NullOr(BillingPlanSummary),
    plans: Schema.Array(BillingPlanOption),
    providerConfigured: Schema.Boolean,
    subscription: Schema.NullOr(SubscriptionSummary),
    visible: Schema.Boolean,
  }),
  usage: Schema.Struct({
    currentPeriodEnd: Schema.NullOr(Schema.Date),
    currentPeriodStart: Schema.NullOr(Schema.Date),
    limits: Schema.Array(UsageLimit),
    meters: Schema.Array(UsageMeterReading),
    visible: Schema.Boolean,
  }),
}) {}

// ---------------------------------------------------------------------------
// Preferences and API keys
// ---------------------------------------------------------------------------

/**
 * Every field optional and none defaulted: a partial update touches only the
 * keys sent. (The zod version re-applied `.default()`s through `.partial()`,
 * so toggling one switch reset theme, language and timezone.)
 */
export class UpdatePreferences extends Schema.Class<UpdatePreferences>(
  "UpdatePreferences",
)({
  theme: Schema.optionalKey(Theme),
  language: Schema.optionalKey(boundedString(10)),
  timezone: Schema.optionalKey(boundedString(50)),
  emailNotifications: Schema.optionalKey(Schema.Boolean),
  pushNotifications: Schema.optionalKey(Schema.Boolean),
}) {}

/** Standard Schema view for TanStack Form validators. */
export const UpdatePreferencesForm =
  Schema.toStandardSchemaV1(UpdatePreferences);

export class CreateApiKey extends Schema.Class<CreateApiKey>("CreateApiKey")({
  name: stringBetween(1, 100),
  permissions: Schema.NonEmptyArray(ApiKeyScope),
  expiresInDays: Schema.optionalKey(
    Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
  ),
}) {}

/** Standard Schema view for TanStack Form validators. */
export const CreateApiKeyForm = Schema.toStandardSchemaV1(CreateApiKey);
