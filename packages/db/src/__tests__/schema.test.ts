import { Effect, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Database } from "../database";
import { layerTest } from "../testing";

const expectedTables = [
  "account",
  "api_keys",
  "application_settings",
  "billing_plan",
  "billing_plan_limit",
  "post",
  "session",
  "usage_meter",
  "user",
  "user_preferences",
  "verification",
  "waitlist_entry",
  "workspace",
  "workspace_invite_allowlist",
  "workspace_membership",
  "workspace_subscription",
  "workspace_usage_rollup",
];

describe("migrations", () => {
  let runtime: ManagedRuntime.ManagedRuntime<Database, never>;
  beforeAll(() => {
    runtime = ManagedRuntime.make(layerTest);
  });
  afterAll(() => runtime.dispose());

  it("creates all 17 tables", async () => {
    const names = await runtime.runPromise(
      Effect.gen(function* () {
        const { sql } = yield* Database;
        const rows = yield* sql<{ name: string }>`
          select name from sqlite_master where type = 'table' order by name
        `;
        return rows.map((row) => row.name);
      }),
    );
    for (const table of expectedTables) {
      expect(names).toContain(table);
    }
    expect(expectedTables).toHaveLength(17);
  });

  it("enforces foreign keys", async () => {
    const [row] = await runtime.runPromise(
      Effect.gen(function* () {
        const { sql } = yield* Database;
        return yield* sql<{ foreign_keys: number }>`pragma foreign_keys`;
      }),
    );
    expect(row?.foreign_keys).toBe(1);
  });
});
