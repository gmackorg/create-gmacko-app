/**
 * Drizzle table ↔ `Model.Class` parity.
 *
 * `@gmacko/domain`'s row models (`packages/domain/src/models`) are the shape
 * of a table inside the contract package, and nothing at compile time ties
 * them to the Drizzle definitions here. This suite is that tie: for every
 * pair below the column set and the `select`-variant field set must match by
 * name, and a column's NOT NULL must match whether the field accepts `null`.
 * It fails on either side drifting — a column added to `schema.ts` without a
 * model field, a model field for a column that no longer exists, a `.notNull()`
 * dropped without the model following.
 *
 * `Model.Sensitive` fields (an API key hash, the Stripe ids) are part of the
 * `select` variant, so they are checked here and still absent from the wire.
 */
import {
  ApiKeyModel,
  ApplicationSettingsModel,
  BillingPlanLimitModel,
  BillingPlanModel,
  PostModel,
  UsageMeterModel,
  UsageRollupModel,
  UserModel,
  UserPreferencesModel,
  WaitlistEntryModel,
  WorkspaceInviteModel,
  WorkspaceMembershipModel,
  WorkspaceModel,
  WorkspaceSubscriptionModel,
} from "@gmacko/domain/models";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import * as schema from "../schema";

/** The part of a `Model.Class` this suite reads: its `select` variant fields. */
interface RowModel {
  readonly select: { readonly fields: Record<string, Schema.Top> };
}

interface Pair {
  readonly table: Table;
  readonly model: RowModel;
}

/**
 * Every table a row model mirrors. better-auth owns `session`, `account` and
 * `verification`; the contract has no model for them (only `SessionRecord`,
 * which is a response shape rather than the row), so they are not listed.
 */
const pairs = {
  user: { table: schema.user, model: UserModel },
  post: { table: schema.Post, model: PostModel },
  user_preferences: {
    table: schema.userPreferences,
    model: UserPreferencesModel,
  },
  api_keys: { table: schema.apiKeys, model: ApiKeyModel },
  workspace: { table: schema.workspace, model: WorkspaceModel },
  workspace_membership: {
    table: schema.workspaceMembership,
    model: WorkspaceMembershipModel,
  },
  workspace_invite_allowlist: {
    table: schema.workspaceInviteAllowlist,
    model: WorkspaceInviteModel,
  },
  application_settings: {
    table: schema.applicationSettings,
    model: ApplicationSettingsModel,
  },
  waitlist_entry: { table: schema.waitlistEntry, model: WaitlistEntryModel },
  billing_plan: { table: schema.billingPlan, model: BillingPlanModel },
  billing_plan_limit: {
    table: schema.billingPlanLimit,
    model: BillingPlanLimitModel,
  },
  workspace_subscription: {
    table: schema.workspaceSubscription,
    model: WorkspaceSubscriptionModel,
  },
  usage_meter: { table: schema.usageMeter, model: UsageMeterModel },
  workspace_usage_rollup: {
    table: schema.workspaceUsageRollup,
    model: UsageRollupModel,
  },
} satisfies Readonly<Record<string, Pair>>;

/** `true` when the field's decoded type admits `null`. */
const acceptsNull = (field: Schema.Top): boolean =>
  // SAFETY: `Schema.Top` is the supertype of every `Schema.Codec<T, E, RD, RE>`
  // and `Schema.is` reads only the AST, which `Top` already declares; the
  // parameter is `Codec<unknown>` so that `is` returns a predicate over
  // `unknown`, which is what `null` is being tested against here.
  Schema.is(field as Schema.Codec<unknown>)(null);

describe.each(Object.entries(pairs))("%s", (_name, { table, model }) => {
  const columns = getTableColumns(table);
  const fields = model.select.fields;

  it("has the same field names as the table's columns", () => {
    expect(Object.keys(fields).sort()).toEqual(Object.keys(columns).sort());
  });

  it("agrees with every column on nullability", () => {
    const fromColumns = Object.fromEntries(
      Object.entries(columns).map(([key, column]) => [key, !column.notNull]),
    );
    const fromModel = Object.fromEntries(
      Object.entries(fields)
        .filter(([key]) => key in columns)
        .map(([key, field]) => [key, acceptsNull(field)]),
    );
    expect(fromModel).toEqual(fromColumns);
  });
});

it("covers every table in the schema that a row model mirrors", () => {
  const modelled = Object.keys(pairs).sort();
  // better-auth's three tables, plus `rate_limit_window` and
  // `stripe_webhook_event`, which are infrastructure rather than contract
  // (see schema.ts).
  const exempt = [
    "account",
    "rate_limit_window",
    "session",
    "stripe_webhook_event",
    "verification",
  ];
  // Widened by annotation, not asserted: the union of `schema`'s export types
  // is not a supertype of `Table`, so the refinement below needs an element
  // type that is. `is(value, Table)` is what decides membership.
  const exports: ReadonlyArray<unknown> = Object.values(schema);
  const all = exports
    .filter((value): value is Table => is(value, Table))
    .map((table) => getTableName(table))
    .filter((name) => !exempt.includes(name))
    .sort();
  expect(modelled).toEqual(all);
});
