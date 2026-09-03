/**
 * The seed contract, run against a caller-supplied layer so the same
 * assertions cover sqlite-node (`pnpm test`) and a Miniflare D1
 * (`pnpm test:workers`): seeding is an upsert, so running it any number of
 * times leaves one set of default rows, restores their defaults, and never
 * touches an `application_settings` row an operator already owns.
 */
import { eq } from "drizzle-orm";
import { Effect, type Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Database, toDatabaseError } from "../database";
import {
  applicationSettings,
  billingPlan,
  billingPlanLimit,
  usageMeter,
} from "../schema";
import {
  SEED_SETTINGS_ID,
  seedLimits,
  seedLocal,
  seedMeters,
  seedPlans,
  seedSql,
  seedStatements,
} from "../seed";

interface Snapshot {
  readonly plans: ReadonlyArray<{ id: string; key: string; name: string }>;
  readonly limits: ReadonlyArray<{
    planId: string;
    key: string;
    value: number | null;
  }>;
  readonly meters: ReadonlyArray<{ id: string; key: string }>;
  readonly settings: ReadonlyArray<{
    id: string;
    setupCompletedAt: Date | null;
  }>;
}

const snapshot = Effect.gen(function* () {
  const { db } = yield* Database;
  const plans = yield* db
    .select({
      id: billingPlan.id,
      key: billingPlan.key,
      name: billingPlan.name,
    })
    .from(billingPlan)
    .orderBy(billingPlan.key);
  const limits = yield* db
    .select({
      planId: billingPlanLimit.planId,
      key: billingPlanLimit.key,
      value: billingPlanLimit.value,
    })
    .from(billingPlanLimit)
    .orderBy(billingPlanLimit.planId, billingPlanLimit.key);
  const meters = yield* db
    .select({ id: usageMeter.id, key: usageMeter.key })
    .from(usageMeter)
    .orderBy(usageMeter.key);
  const settings = yield* db
    .select({
      id: applicationSettings.id,
      setupCompletedAt: applicationSettings.setupCompletedAt,
    })
    .from(applicationSettings);
  return { plans, limits, meters, settings } satisfies Snapshot;
});

export const seedSuite = (name: string, layer: Layer.Layer<Database>): void => {
  describe(`seed (${name})`, () => {
    let runtime: ManagedRuntime.ManagedRuntime<Database, never>;
    const run = <A, E>(effect: Effect.Effect<A, E, Database>) =>
      runtime.runPromise(effect);

    beforeAll(() => {
      runtime = ManagedRuntime.make(layer);
    });
    afterAll(() => runtime.dispose());

    it("seeds the defaults once and is idempotent on the second run", async () => {
      const first = await run(Effect.andThen(seedLocal, snapshot));
      expect(first.plans.map((p) => p.key)).toEqual(
        [...seedPlans].map((p) => p.key).sort(),
      );
      expect(first.meters.map((m) => m.key)).toEqual(
        [...seedMeters].map((m) => m.key).sort(),
      );
      expect(first.limits).toHaveLength(seedLimits.length);
      expect(first.settings).toEqual([
        { id: SEED_SETTINGS_ID, setupCompletedAt: null },
      ]);
      // Every limit points at a seeded plan.
      const planIds = new Set(first.plans.map((p) => p.id));
      for (const limit of first.limits)
        expect(planIds.has(limit.planId)).toBe(true);

      const second = await run(Effect.andThen(seedLocal, snapshot));
      expect(second).toEqual(first);
    });

    it("restores edited defaults without changing ids (upsert, not insert)", async () => {
      const before = await run(snapshot);
      const free = before.plans.find((p) => p.key === "free");
      expect(free).toBeDefined();
      await run(
        Effect.gen(function* () {
          const { db } = yield* Database;
          yield* db
            .update(billingPlan)
            .set({ name: "Renamed" })
            .where(eq(billingPlan.key, "free"));
          yield* db
            .update(billingPlanLimit)
            .set({ value: 1 })
            .where(eq(billingPlanLimit.key, "seats"));
        }),
      );
      const after = await run(Effect.andThen(seedLocal, snapshot));
      expect(after).toEqual(before);
    });

    it("leaves an operator-owned application_settings row alone", async () => {
      const completedAt = new Date("2026-02-02T00:00:00.000Z");
      const ownId = crypto.randomUUID();
      const after = await run(
        Effect.gen(function* () {
          const { db } = yield* Database;
          yield* db.delete(applicationSettings);
          yield* db.insert(applicationSettings).values({
            id: ownId,
            setupCompletedAt: completedAt,
          });
          yield* seedLocal;
          return yield* snapshot;
        }),
      );
      expect(after.settings).toEqual([
        { id: ownId, setupCompletedAt: completedAt },
      ]);
    });

    it("renders the same statements as literal SQL that applies idempotently", async () => {
      const outcome = await run(
        Effect.gen(function* () {
          const { db, sql } = yield* Database;
          const rendered = seedSql(db);
          // One statement per line, `;`-terminated, after the comment header.
          const statements = rendered
            .split("\n")
            .filter((line) => line.length > 0 && !line.startsWith("--"))
            .map((line) => line.replace(/;$/, ""));
          const before = yield* snapshot;
          for (const _ of [1, 2]) {
            yield* Effect.forEach(
              statements,
              (statement) =>
                sql.unsafe(statement).pipe(Effect.mapError(toDatabaseError)),
              { discard: true },
            );
          }
          const after = yield* snapshot;
          return {
            rendered,
            statementCount: statements.length,
            expected: seedStatements(db).length,
            before,
            after,
          };
        }),
      );
      expect(outcome.rendered).not.toContain("?");
      expect(outcome.statementCount).toBe(outcome.expected);
      expect(outcome.after).toEqual(outcome.before);
    });
  });
};
