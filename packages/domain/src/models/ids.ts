/**
 * Branded ids for every table `packages/domain/src/models` mirrors. They live
 * here rather than beside the contract classes so the row models and the
 * contract can both import them without a cycle; the group modules
 * (`auth/models.ts`, `settings/models.ts`, ...) re-export the ones they own,
 * so the package's public names are unchanged.
 */
import { id } from "../primitives";

export const UserId = id("UserId");
export type UserId = typeof UserId.Type;

export const PostId = id("PostId");
export type PostId = typeof PostId.Type;

export const UserPreferencesId = id("UserPreferencesId");
export type UserPreferencesId = typeof UserPreferencesId.Type;

export const ApiKeyId = id("ApiKeyId");
export type ApiKeyId = typeof ApiKeyId.Type;

export const WorkspaceId = id("WorkspaceId");
export type WorkspaceId = typeof WorkspaceId.Type;

export const WorkspaceMembershipId = id("WorkspaceMembershipId");
export type WorkspaceMembershipId = typeof WorkspaceMembershipId.Type;

export const InviteId = id("InviteId");
export type InviteId = typeof InviteId.Type;

export const ApplicationSettingsId = id("ApplicationSettingsId");
export type ApplicationSettingsId = typeof ApplicationSettingsId.Type;

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
