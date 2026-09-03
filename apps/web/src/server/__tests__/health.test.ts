/**
 * The four health probes, served by `HealthApi` from @gmacko/domain through
 * the app's handler: the ForgeGraph one keeps its absolute path, failures
 * are 503s, and detail leaks only in development.
 */
import { Auth } from "@gmacko/auth/service";
import { Database, DatabaseError } from "@gmacko/db";
import { layerTest } from "@gmacko/db/testing";
import { Effect, Layer } from "effect";
import { afterAll, describe, expect, it } from "vitest";

import { AppConfig, makeApiHandler } from "~/server/api";
import { makeAuthOptions } from "~/server/auth";

const config = (stage: string) =>
  AppConfig.fromBindings(
    {
      STAGE: stage,
      AUTH_SECRET: "test-secret-that-is-long-enough-for-better-auth",
      PORTLESS_URL: "http://localhost:3001",
    },
    { version: "1.2.3" },
  );

/** The test database, with `ping` replaced by a failure carrying driver detail. */
const brokenDatabase = Layer.effect(Database)(
  Effect.map(Database, (database) =>
    Database.of({
      ...database,
      ping: Effect.fail(
        new DatabaseError({
          reason: "other",
          cause: new Error("SQLITE_CANTOPEN: /secret/path/db.sqlite"),
        }),
      ),
    }),
  ),
).pipe(Layer.provide(layerTest));

const services = (stage: string, database: Layer.Layer<Database>) => {
  const appConfig = Layer.succeed(AppConfig)(config(stage));
  return Layer.mergeAll(
    appConfig,
    database,
    Auth.layer(
      makeAuthOptions(config(stage), {
        magicLink: { send: async () => {} },
      }),
    ).pipe(Layer.provide(Layer.mergeAll(appConfig, database))),
  );
};

const disposers: Array<() => Promise<void>> = [];
afterAll(async () => {
  for (const dispose of disposers) await dispose();
});

const handlerFor = (stage: string, database: Layer.Layer<Database>) => {
  const api = makeApiHandler(services(stage, database));
  disposers.push(api.dispose);
  return (path: string) => api.handler(new Request(`http://localhost${path}`));
};

describe("health probes", () => {
  it("serve live, ready, full and forge on their paths", async () => {
    const get = handlerFor("development", layerTest);

    const live = await get("/api/health/live");
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "ok", stage: "development" });

    const ready = await get("/api/health/ready");
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({ status: "ok" });

    const full = await get("/api/health");
    expect(full.status).toBe(200);
    expect(await full.json()).toMatchObject({
      status: "healthy",
      version: "1.2.3",
      checks: { database: { status: "pass" } },
    });

    const forge = await get("/.well-known/forge-health");
    expect(forge.status).toBe(200);
    const body = (await forge.json()) as {
      status: string;
      version: string;
      timestamp: string;
      checks: { database: { status: string; checkedAt: string } };
    };
    expect(body).toMatchObject({
      status: "healthy",
      version: "1.0",
      checks: { database: { status: "healthy" } },
    });
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    expect(new Date(body.checks.database.checkedAt).toISOString()).toBe(
      body.checks.database.checkedAt,
    );
  });

  it("answer 503 with generic detail outside development", async () => {
    const get = handlerFor("production", brokenDatabase);

    const ready = await get("/api/health/ready");
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({
      _tag: "Unhealthy",
      status: "unhealthy",
      detail: "database unavailable",
    });

    const full = await get("/api/health");
    expect(full.status).toBe(503);
    expect(await full.json()).toMatchObject({
      _tag: "UnhealthyReport",
      status: "unhealthy",
      checks: {
        database: { status: "fail", message: "Database connection failed" },
      },
    });

    const forge = await get("/.well-known/forge-health");
    expect(forge.status).toBe(503);
    const body = JSON.stringify(await forge.json());
    expect(body).toContain('"error":"connection failed"');
    expect(body).not.toContain("secret");

    const live = await get("/api/health/live");
    expect(live.status).toBe(200);
  });

  it("include the driver reason in development", async () => {
    const get = handlerFor("development", brokenDatabase);
    const ready = await get("/api/health/ready");
    expect(ready.status).toBe(503);
    expect(await ready.json()).toMatchObject({
      detail:
        "database unavailable: other (SQLITE_CANTOPEN: /secret/path/db.sqlite)",
    });
  });
});
