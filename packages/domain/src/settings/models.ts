/**
 * Everything a signed-in user (or an operator key) reads and writes about
 * their own account, workspace and billing, plus the public launch state and
 * waitlist. The row-shaped classes are `Schema.Class`es over the `json`
 * variant of the `Model.Class` declarations in `../models`, so they mirror
 * @gmacko/db's tables one to one minus the columns marked
 * `Model.Sensitive`; response shapes mirror what the legacy procedures
 * returned, typed where they were `string`.
 */
import { Effect, Schema } from "effect";
import {
  BillingPlanLimitModel,
  BillingPlanModel,
  UsageMeterModel,
  UsageRollupModel,
  WorkspaceSubscriptionModel,
} from "../models/billing";
import {
  AnnouncementTone,
  BillingInterval,
  BillingLimitPeriod,
  BillingProvider,
  Theme,
  UsageAggregation,
  WaitlistSource,
  WaitlistStatus,
  WorkspaceSubscriptionStatus,
} from "../models/enums";
import {
  ApiKeyId,
  BillingPlanId,
  BillingPlanLimitId,
  InviteId,
  UsageMeterId,
  UsageRollupId,
  UserId,
  UserPreferencesId,
  WaitlistEntryId,
  WorkspaceId,
  WorkspaceMembershipId,
  WorkspaceSubscriptionId,
} from "../models/ids";
import {
  ApiKeyModel,
  WaitlistEntryModel,
  WorkspaceInviteModel,
  WorkspaceMembershipModel,
  WorkspaceModel,
} from "../models/settings";
import { boundedString, Email, stringBetween } from "../primitives";
import { ApiKeyScope, UserRole, WorkspaceMemberRole } from "../roles";

// ---------------------------------------------------------------------------
// Enums and ids (declared in ../models so the row models can import them)
// ---------------------------------------------------------------------------

export {
  AnnouncementTone,
  ApiKeyId,
  BillingInterval,
  BillingLimitPeriod,
  BillingPlanId,
  BillingPlanLimitId,
  BillingProvider,
  InviteId,
  Theme,
  UsageAggregation,
  UsageMeterId,
  UsageRollupId,
  UserPreferencesId,
  WaitlistEntryId,
  WaitlistSource,
  WaitlistStatus,
  WorkspaceId,
  WorkspaceMembershipId,
  WorkspaceSubscriptionId,
  WorkspaceSubscriptionStatus,
};

/** The roles an invite may grant; owners are never invited. */
export const InviteRole = Schema.Literals(["admin", "member"]);
export type InviteRole = typeof InviteRole.Type;

// ---------------------------------------------------------------------------
// Row models (the `json` variant of ../models, named for the OpenAPI document)
// ---------------------------------------------------------------------------

/**
 * The caller's preferences. `getPreferences` answers the defaults without
 * writing a row, so `id`, `createdAt` and `updatedAt` are `null` until the
 * first `updatePreferences`; the other fields always carry a value. This is
 * the one row class that is not `Model.json`: the columns are all NOT NULL,
 * the unwritten default response is not.
 */
export class UserPreferences extends Schema.Class<UserPreferences>(
  "UserPreferences",
)({
  /** `null` until first write. */
  id: Schema.NullOr(UserPreferencesId),
  userId: UserId,
  /** See `Theme`: the column is free text, the row model is not. */
  theme: Theme,
  language: Schema.String,
  timezone: Schema.String,
  emailNotifications: Schema.Boolean,
  pushNotifications: Schema.Boolean,
  /** `null` until first write. */
  createdAt: Schema.NullOr(Schema.Date),
  updatedAt: Schema.NullOr(Schema.Date),
}) {}

/** An API key as listed: never the hash, never the plaintext. */
export class ApiKey extends Schema.Class<ApiKey>("ApiKey")(
  ApiKeyModel.json.fields,
) {}

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

export class Workspace extends Schema.Class<Workspace>("Workspace")(
  WorkspaceModel.json.fields,
) {}

export class WorkspaceMembership extends Schema.Class<WorkspaceMembership>(
  "WorkspaceMembership",
)(WorkspaceMembershipModel.json.fields) {}

/** An allowlist entry: the email may sign up and joins the workspace with `role`. */
export class WorkspaceInvite extends Schema.Class<WorkspaceInvite>(
  "WorkspaceInvite",
)(WorkspaceInviteModel.json.fields) {}

export class WaitlistEntry extends Schema.Class<WaitlistEntry>("WaitlistEntry")(
  WaitlistEntryModel.json.fields,
) {}

export class BillingPlan extends Schema.Class<BillingPlan>("BillingPlan")(
  BillingPlanModel.json.fields,
) {}

export class BillingPlanLimit extends Schema.Class<BillingPlanLimit>(
  "BillingPlanLimit",
)(BillingPlanLimitModel.json.fields) {}

/** The Stripe customer/subscription ids stay server-side (`Model.Sensitive`); `customerPortalAvailable` is derived from them. */
export class WorkspaceSubscription extends Schema.Class<WorkspaceSubscription>(
  "WorkspaceSubscription",
)(WorkspaceSubscriptionModel.json.fields) {}

export class UsageMeter extends Schema.Class<UsageMeter>("UsageMeter")(
  UsageMeterModel.json.fields,
) {}

export class UsageRollup extends Schema.Class<UsageRollup>("UsageRollup")(
  UsageRollupModel.json.fields,
) {}

// ---------------------------------------------------------------------------
// Launch state and waitlist (public)
// ---------------------------------------------------------------------------

export class LaunchState extends Schema.Class<LaunchState>("LaunchState")({
  announcementMessage: Schema.NullOr(Schema.String),
  /** See `AnnouncementTone`: the column is free text, the model is not. */
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

/**
 * One submission per (email, source): a re-submission replaces `message` and
 * `referralCode` with what it carries, so omitting them clears the stored
 * ones. A reviewed entry keeps its status.
 */
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
