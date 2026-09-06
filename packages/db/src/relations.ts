/**
 * Relations for the relational query API (`db.query.*`). Every table in the
 * schema is registered, so `db.query.<table>` exists even where no relation
 * is declared; `with: {...}` is available where the FK graph allows it.
 */
import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  user: {
    sessions: r.many.session({ from: r.user.id, to: r.session.userId }),
    accounts: r.many.account({ from: r.user.id, to: r.account.userId }),
    preferences: r.one.userPreferences({
      from: r.user.id,
      to: r.userPreferences.userId,
    }),
    apiKeys: r.many.apiKeys({ from: r.user.id, to: r.apiKeys.userId }),
    ownedWorkspaces: r.many.workspace({
      from: r.user.id,
      to: r.workspace.ownerUserId,
    }),
    memberships: r.many.workspaceMembership({
      from: r.user.id,
      to: r.workspaceMembership.userId,
    }),
  },
  session: {
    user: r.one.user({ from: r.session.userId, to: r.user.id }),
  },
  account: {
    user: r.one.user({ from: r.account.userId, to: r.user.id }),
  },
  userPreferences: {
    user: r.one.user({ from: r.userPreferences.userId, to: r.user.id }),
  },
  apiKeys: {
    user: r.one.user({ from: r.apiKeys.userId, to: r.user.id }),
  },
  workspace: {
    owner: r.one.user({ from: r.workspace.ownerUserId, to: r.user.id }),
    memberships: r.many.workspaceMembership({
      from: r.workspace.id,
      to: r.workspaceMembership.workspaceId,
    }),
    invites: r.many.workspaceInviteAllowlist({
      from: r.workspace.id,
      to: r.workspaceInviteAllowlist.workspaceId,
    }),
    subscription: r.one.workspaceSubscription({
      from: r.workspace.id,
      to: r.workspaceSubscription.workspaceId,
    }),
    usageRollups: r.many.workspaceUsageRollup({
      from: r.workspace.id,
      to: r.workspaceUsageRollup.workspaceId,
    }),
  },
  workspaceMembership: {
    workspace: r.one.workspace({
      from: r.workspaceMembership.workspaceId,
      to: r.workspace.id,
    }),
    user: r.one.user({ from: r.workspaceMembership.userId, to: r.user.id }),
  },
  workspaceInviteAllowlist: {
    workspace: r.one.workspace({
      from: r.workspaceInviteAllowlist.workspaceId,
      to: r.workspace.id,
    }),
    invitedBy: r.one.user({
      from: r.workspaceInviteAllowlist.invitedByUserId,
      to: r.user.id,
    }),
  },
  applicationSettings: {
    setupCompletedBy: r.one.user({
      from: r.applicationSettings.setupCompletedByUserId,
      to: r.user.id,
    }),
    initialWorkspace: r.one.workspace({
      from: r.applicationSettings.initialWorkspaceId,
      to: r.workspace.id,
    }),
  },
  waitlistEntry: {
    reviewedBy: r.one.user({
      from: r.waitlistEntry.reviewedByUserId,
      to: r.user.id,
    }),
  },
  billingPlan: {
    limits: r.many.billingPlanLimit({
      from: r.billingPlan.id,
      to: r.billingPlanLimit.planId,
    }),
    subscriptions: r.many.workspaceSubscription({
      from: r.billingPlan.id,
      to: r.workspaceSubscription.planId,
    }),
  },
  billingPlanLimit: {
    plan: r.one.billingPlan({
      from: r.billingPlanLimit.planId,
      to: r.billingPlan.id,
    }),
  },
  workspaceSubscription: {
    workspace: r.one.workspace({
      from: r.workspaceSubscription.workspaceId,
      to: r.workspace.id,
    }),
    plan: r.one.billingPlan({
      from: r.workspaceSubscription.planId,
      to: r.billingPlan.id,
    }),
  },
  usageMeter: {
    rollups: r.many.workspaceUsageRollup({
      from: r.usageMeter.id,
      to: r.workspaceUsageRollup.meterId,
    }),
  },
  workspaceUsageRollup: {
    workspace: r.one.workspace({
      from: r.workspaceUsageRollup.workspaceId,
      to: r.workspace.id,
    }),
    meter: r.one.usageMeter({
      from: r.workspaceUsageRollup.meterId,
      to: r.usageMeter.id,
    }),
  },
}));

export type Relations = typeof relations;
