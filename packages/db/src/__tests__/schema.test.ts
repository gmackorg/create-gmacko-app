import { getTableConfig } from "drizzle-orm/sqlite-core";
import { Effect, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deviceCode } from "../auth-schema";
import { Database } from "../database";
import { layerTest } from "../testing";

const expectedTables = [
  "account",
  "api_keys",
  "application_settings",
  "billing_plan",
  "billing_plan_limit",
  "device_code",
  "post",
  "rate_limit_window",
  "session",
  "stripe_webhook_event",
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

  it("creates exactly the 20 expected tables", async () => {
    const names = await runtime.runPromise(
      Effect.gen(function* () {
        const { sql } = yield* Database;
        // sqlite_* are sqlite's own (sqlite_sequence, sqlite_stat*), never ours.
        const rows = yield* sql<{ name: string }>`
          select name from sqlite_master
          where type = 'table' and name not like 'sqlite\\_%' escape '\\'
          order by name
        `;
        return rows.map((row) => row.name);
      }),
    );
    expect(names).toHaveLength(20);
    expect(names).toEqual([...expectedTables].sort());
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

  it("carries the table the device-authorization plugin expects", () => {
    // Field names and constraints must match better-auth's
    // `deviceAuthorization` plugin schema; drift here (the kind a schema
    // regeneration introduces) breaks mobile QR pairing at runtime.
    const config = getTableConfig(deviceCode);
    expect(config.name).toBe("device_code");
    expect(config.columns.map((column) => column.name).sort()).toEqual([
      "client_id",
      "device_code",
      "expires_at",
      "id",
      "last_polled_at",
      "polling_interval",
      "scope",
      "status",
      "user_code",
      "user_id",
    ]);
    // Codes are single-use credentials looked up on every poll/approval:
    // uniqueness is a correctness requirement and provides the hot-path index.
    expect(deviceCode.deviceCode.notNull).toBe(true);
    expect(deviceCode.deviceCode.isUnique).toBe(true);
    expect(deviceCode.userCode.notNull).toBe(true);
    expect(deviceCode.userCode.isUnique).toBe(true);
    expect(deviceCode.expiresAt.notNull).toBe(true);
    expect(deviceCode.status.notNull).toBe(true);
  });
});
