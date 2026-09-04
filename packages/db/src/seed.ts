/**
 * Default rows every environment starts from: billing plans and their limits,
 * usage meters, and the `application_settings` singleton. Users are never
 * seeded; sign-in creates them.
 *
 * One definition, two deliveries:
 * - `seedLocal`: an Effect over the `Database` service, for the vitest suites,
 *   Playwright's global setup, and anything else holding a layer.
 * - `seedSql`: the identical statements rendered with literal values, written
 *   to `seed/seed.sql` by `pnpm seed:sql` and applied to a local D1 with
 *   `pnpm seed:local` (`wrangler d1 execute --file`), because D1 is reachable
 *   only from a Worker or wrangler.
 *
 * Every statement is an upsert keyed on the row's business identity (`key`
 * for plans and meters, `(plan, key)` for limits), so seeding twice is a
 * no-op, seeding after an edit restores the defaults, and ids already in the
 * database are kept (limits reference plans through a subquery on `key`, not
 * a fixed id). The settings row is inserted only if the table is empty: an
 * operator-owned row, whatever its id, is never touched.
 */
import { sql as dsql, getTableName, is, Table } from "drizzle-orm";
import {
  getTableConfig,
  SQLiteDialect,
  type SQLiteTable,
} from "drizzle-orm/sqlite-core";
import { Effect } from "effect";

import {
  type BatchItem,
  Database,
  type DatabaseDrizzle,
  type DatabaseError,
} from "./database";
import * as schema from "./schema";
import {
  applicationSettings,
  type BillingInterval,
  type BillingLimitPeriod,
  billingPlan,
  billingPlanLimit,
  type UsageAggregation,
  usageMeter,
} from "./schema";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/**
 * A fixed `created_at` / `updated_at` for seeded rows so `seed/seed.sql` is
 * byte-stable across regenerations (`created_at` has no database default and
 * drizzle's `$onUpdateFn` would otherwise stamp `updated_at` with now; see
 * README).
 */
export const SEED_AT = new Date("2026-01-01T00:00:00.000Z");

/** The id of the settings row the seed creates on an empty table. */
export const SEED_SETTINGS_ID = "default";

export interface SeedPlan {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly interval: BillingInterval;
  readonly amountInCents: number;
  readonly isDefault: boolean;
}

export const seedPlans: ReadonlyArray<SeedPlan> = [
  {
    id: "plan_free",
    key: "free",
    name: "Free",
    description: "For trying things out. One workspace, a few seats.",
    interval: "month",
    amountInCents: 0,
    isDefault: true,
  },
  {
    id: "plan_pro",
    key: "pro",
    name: "Pro",
    description:
      "For teams shipping to customers. Higher limits, priority support.",
    interval: "month",
    amountInCents: 2900,
    isDefault: false,
  },
];

export interface SeedMeter {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly aggregation: UsageAggregation;
  readonly unit: string;
}

/** Meter keys double as limit keys: the settings page joins them on `key`. */
export const seedMeters: ReadonlyArray<SeedMeter> = [
  {
    id: "meter_api_requests",
    key: "api_requests",
    name: "API requests",
    description: "Authenticated API calls, summed per period.",
    aggregation: "sum",
    unit: "count",
  },
  {
    id: "meter_seats",
    key: "seats",
    name: "Seats",
    description: "Workspace members, the high-water mark per period.",
    aggregation: "max",
    unit: "count",
  },
  {
    id: "meter_posts",
    key: "posts",
    name: "Posts",
    description: "Posts created, summed per period.",
    aggregation: "sum",
    unit: "count",
  },
];

export interface SeedLimit {
  readonly id: string;
  readonly planKey: string;
  readonly key: string;
  /** `null` is unlimited. */
  readonly value: number | null;
  readonly period: BillingLimitPeriod;
}

export const seedLimits: ReadonlyArray<SeedLimit> = [
  {
    id: "limit_free_api_requests",
    planKey: "free",
    key: "api_requests",
    value: 1_000,
    period: "month",
  },
  {
    id: "limit_free_seats",
    planKey: "free",
    key: "seats",
    value: 3,
    period: "all_time",
  },
  {
    id: "limit_free_posts",
    planKey: "free",
    key: "posts",
    value: 50,
    period: "month",
  },
  {
    id: "limit_pro_api_requests",
    planKey: "pro",
    key: "api_requests",
    value: 100_000,
    period: "month",
  },
  {
    id: "limit_pro_seats",
    planKey: "pro",
    key: "seats",
    value: 25,
    period: "all_time",
  },
  {
    id: "limit_pro_posts",
    planKey: "pro",
    key: "posts",
    value: null,
    period: "month",
  },
];

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

/** A drizzle builder: batchable (`toSQL`) and renderable (`getSQL`). */
export interface SeedStatement extends BatchItem {
  readonly getSQL: () => ReturnType<typeof dsql>;
}

/**
 * The seed as drizzle statements against `db`, in dependency order (plans
 * before limits). Building them performs no I/O.
 */
export const seedStatements = (
  db: DatabaseDrizzle,
): ReadonlyArray<SeedStatement> => [
  ...seedPlans.map((plan) =>
    db
      .insert(billingPlan)
      .values({
        id: plan.id,
        key: plan.key,
        name: plan.name,
        description: plan.description,
        interval: plan.interval,
        amountInCents: plan.amountInCents,
        currency: "usd",
        isDefault: plan.isDefault,
        active: true,
        createdAt: SEED_AT,
        updatedAt: SEED_AT,
      })
      .onConflictDoUpdate({
        target: billingPlan.key,
        set: {
          name: dsql`excluded.name`,
          description: dsql`excluded.description`,
          interval: dsql`excluded.interval`,
          amountInCents: dsql`excluded.amount_in_cents`,
          currency: dsql`excluded.currency`,
          isDefault: dsql`excluded.is_default`,
          active: dsql`excluded.active`,
          updatedAt: dsql`excluded.updated_at`,
        },
      }),
  ),
  ...seedLimits.map((limit) =>
    db
      .insert(billingPlanLimit)
      .values({
        id: limit.id,
        // By key, not by the seeded id: an existing plan keeps its own id.
        planId: dsql`(select ${billingPlan.id} from ${billingPlan} where ${billingPlan.key} = ${limit.planKey})`,
        key: limit.key,
        value: limit.value,
        period: limit.period,
        createdAt: SEED_AT,
        updatedAt: SEED_AT,
      })
      .onConflictDoUpdate({
        target: [billingPlanLimit.planId, billingPlanLimit.key],
        set: {
          value: dsql`excluded.value`,
          period: dsql`excluded.period`,
          updatedAt: dsql`excluded.updated_at`,
        },
      }),
  ),
  ...seedMeters.map((meter) =>
    db
      .insert(usageMeter)
      .values({
        id: meter.id,
        key: meter.key,
        name: meter.name,
        description: meter.description,
        aggregation: meter.aggregation,
        unit: meter.unit,
        createdAt: SEED_AT,
        updatedAt: SEED_AT,
      })
      .onConflictDoUpdate({
        target: usageMeter.key,
        set: {
          name: dsql`excluded.name`,
          description: dsql`excluded.description`,
          aggregation: dsql`excluded.aggregation`,
          unit: dsql`excluded.unit`,
          updatedAt: dsql`excluded.updated_at`,
        },
      }),
  ),
  // The singleton: only when no row exists at all, so an operator's row
  // (any id, setup completed or not) is left exactly as it is.
  db
    .insert(applicationSettings, "id", "createdAt")
    .select(
      dsql`select ${SEED_SETTINGS_ID}, ${SEED_AT.getTime()} where not exists (select 1 from ${applicationSettings})`,
    ),
];

export interface SeedSummary {
  readonly plans: number;
  readonly limits: number;
  readonly meters: number;
  readonly statements: number;
}

/**
 * Applies the seed atomically through `Database.batch` (all rows or none).
 * Safe to run any number of times.
 */
export const seedLocal: Effect.Effect<SeedSummary, DatabaseError, Database> =
  Effect.gen(function* () {
    const { db, batch } = yield* Database;
    const statements = seedStatements(db);
    yield* batch(statements);
    return {
      plans: seedPlans.length,
      limits: seedLimits.length,
      meters: seedMeters.length,
      statements: statements.length,
    };
  });

const dialect = new SQLiteDialect();

/**
 * The seed rendered as one SQL text with every parameter inlined (drizzle's
 * `inlineParams`, so strings are escaped by the dialect), one statement per
 * line, terminated by `;`. What `pnpm seed:sql` writes to `seed/seed.sql`.
 */
export const seedSql = (db: DatabaseDrizzle): string => {
  const header = [
    "-- Generated by `pnpm -F @gmacko/db seed:sql` from src/seed.ts. Do not edit.",
    "-- Idempotent: every statement is an upsert; apply as often as you like.",
  ];
  const body = seedStatements(db).map(
    (statement) =>
      `${dialect.sqlToQuery(statement.getSQL().inlineParams()).sql};`,
  );
  return `${[...header, ...body].join("\n")}\n`;
};

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/** Every table this schema owns; D1's own `d1_migrations` is not one of them. */
const schemaTables = (): ReadonlyArray<SQLiteTable> =>
  (Object.values(schema) as ReadonlyArray<unknown>).filter(
    (value): value is SQLiteTable => is(value, Table),
  );

/**
 * Table names with every table ordered after the tables that reference it, so
 * deleting in this order never trips a foreign key. Derived from the schema's
 * own foreign keys, so it cannot drift; a cycle would be a schema bug and
 * throws here rather than producing a file that half works.
 */
const deletionOrder = (): ReadonlyArray<string> => {
  const tables = schemaTables();
  const referencedBy = new Map<string, Array<string>>();
  for (const table of tables) referencedBy.set(getTableName(table), []);
  for (const table of tables) {
    const name = getTableName(table);
    for (const key of getTableConfig(table).foreignKeys) {
      const parent = getTableName(key.reference().foreignTable);
      if (parent === name) continue; // self-reference: no ordering to satisfy
      const children = referencedBy.get(parent);
      if (children !== undefined && !children.includes(name)) {
        children.push(name);
      }
    }
  }
  const order: Array<string> = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string): void => {
    const seen = state.get(name);
    if (seen === "done") return;
    if (seen === "visiting") {
      throw new Error(`foreign key cycle through "${name}"`);
    }
    state.set(name, "visiting");
    // Sorted, so the emitted order depends only on the schema, not on the
    // order the module system happened to hand us the tables in.
    for (const child of [...(referencedBy.get(name) ?? [])].sort()) {
      visit(child);
    }
    state.set(name, "done");
    order.push(name);
  };
  for (const name of [...referencedBy.keys()].sort()) visit(name);
  return order;
};

/**
 * `delete from` every table, children first: empties a database without
 * dropping anything, which is what the D1 rule requires (never a table
 * rebuild; see docs/adr/0001). `d1_migrations` is D1's, not ours, so a reset
 * does not make the migrations re-run.
 *
 * Used to reset the shared preview database (docs/DEPLOYMENT.md, "Previews").
 * Never point it at staging or production.
 */
export const resetSql = (): string => {
  const header = [
    "-- Generated by `pnpm -F @gmacko/db seed:sql` from src/seed.ts. Do not edit.",
    "-- DESTRUCTIVE: empties every table. Preview and local only.",
    "-- Children before parents, so no foreign key is tripped.",
  ];
  const body = deletionOrder().map((name) => `delete from "${name}";`);
  return `${[...header, ...body].join("\n")}\n`;
};
