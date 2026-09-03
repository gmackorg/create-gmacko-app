/**
 * The four probes through the web handler: the ForgeGraph one keeps its
 * absolute path, failures are 503s, detail leaks only in development, and
 * the JSON shapes are pinned (development and production variants).
 */
import { Database, DatabaseError } from "@gmacko/db";
import { layerTest } from "@gmacko/db/testing";
import { Effect, Layer } from "effect";
import { afterAll, describe, expect, it } from "vitest";

import { makeTestApi, type TestApi } from "../testing";
import { CHECK_TTL_MS } from "./service";

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

/** Counts pings, so the 5-second cache is observable. */
const countingDatabase = (counter: { pings: number }) =>
  Layer.effect(Database)(
    Effect.map(Database, (database) =>
      Database.of({
        ...database,
        ping: Effect.suspend(() => {
          counter.pings += 1;
          return database.ping;
        }),
      }),
    ),
  ).pipe(Layer.provide(layerTest));

const apis: Array<TestApi> = [];
afterAll(async () => {
  for (const api of apis) await api.dispose();
});
const start = (...args: Parameters<typeof makeTestApi>) => {
  const api = makeTestApi(...args);
  apis.push(api);
  return api;
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Replaces the values that change per run with their kind, for the snapshot. */
const shape = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(shape);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, shape(entry)]),
    );
  }
  if (typeof value === "string" && ISO.test(value)) return "<iso-date>";
  if (typeof value === "number") return "<number>";
  return value;
};

describe("health probes", () => {
  it("serve live, ready, full and forge on their paths", async () => {
    const api = start();
    const [live, ready, full, forge] = await Promise.all([
      api.fetch("/api/health/live"),
      api.fetch("/api/health/ready"),
      api.fetch("/api/health"),
      api.fetch("/.well-known/forge-health"),
    ]);
    expect([live.status, ready.status, full.status, forge.status]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(await live.json()).toEqual({ status: "ok", stage: "development" });
    expect(await ready.json()).toMatchObject({ status: "ok" });
    const report = await full.json();
    expect(report).toMatchObject({
      status: "healthy",
      version: "0.0.0-test",
      checks: { database: { status: "pass" } },
    });
    const body = (await forge.json()) as {
      timestamp: string;
      checks: { database: { checkedAt: string } };
    };
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    expect(new Date(body.checks.database.checkedAt).toISOString()).toBe(
      body.checks.database.checkedAt,
    );
  });

  it("answer 503 with generic detail outside development", async () => {
    const api = start({ stage: "production", database: brokenDatabase });

    const ready = await api.fetch("/api/health/ready");
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({
      _tag: "Unhealthy",
      status: "unhealthy",
      detail: "database unavailable",
    });

    const full = await api.fetch("/api/health");
    expect(full.status).toBe(503);
    expect(await full.json()).toMatchObject({
      _tag: "UnhealthyReport",
      status: "unhealthy",
      checks: {
        database: { status: "fail", message: "Database connection failed" },
      },
    });

    const forge = await api.fetch("/.well-known/forge-health");
    expect(forge.status).toBe(503);
    const text = JSON.stringify(await forge.json());
    expect(text).toContain('"error":"connection failed"');
    expect(text).not.toContain("secret");

    expect((await api.fetch("/api/health/live")).status).toBe(200);
  });

  it("include the driver reason in development, and log the failure", async () => {
    const api = start({ stage: "development", database: brokenDatabase });
    const ready = await api.fetch("/api/health/ready");
    expect(ready.status).toBe(503);
    expect(await ready.json()).toMatchObject({
      detail:
        "database unavailable: other (SQLITE_CANTOPEN: /secret/path/db.sqlite)",
    });
    expect(
      api.logs.some((entry) =>
        String(entry.message).includes("readiness probe: database ping failed"),
      ),
    ).toBe(true);
  });

  it("reuse a successful check for five seconds and never a failed one", async () => {
    const counter = { pings: 0 };
    const api = start({ database: countingDatabase(counter) });
    await api.fetch("/api/health/ready");
    await api.fetch("/api/health");
    await api.fetch("/.well-known/forge-health");
    expect(counter.pings).toBe(1);
    expect(CHECK_TTL_MS).toBe(5_000);

    const broken = start({ database: brokenDatabase });
    expect((await broken.fetch("/api/health/ready")).status).toBe(503);
    expect((await broken.fetch("/api/health/ready")).status).toBe(503);
  });

  it("pins the four JSON shapes in development", async () => {
    const api = start({ stage: "development" });
    const bodies = await Promise.all(
      [
        "/api/health/live",
        "/api/health/ready",
        "/api/health",
        "/.well-known/forge-health",
      ].map((path) => api.fetch(path).then((r) => r.json())),
    );
    expect(shape(bodies)).toMatchInlineSnapshot(`
      [
        {
          "stage": "development",
          "status": "ok",
        },
        {
          "latencyMs": "<number>",
          "status": "ok",
        },
        {
          "checks": {
            "database": {
              "responseTime": "<number>",
              "status": "pass",
            },
          },
          "status": "healthy",
          "timestamp": "<iso-date>",
          "version": "0.0.0-test",
        },
        {
          "checks": {
            "database": {
              "checkedAt": "<iso-date>",
              "latencyMs": "<number>",
              "status": "healthy",
            },
          },
          "status": "healthy",
          "timestamp": "<iso-date>",
          "version": "1.0",
        },
      ]
    `);
  });

  it("pins the four JSON shapes in production, healthy and unhealthy", async () => {
    const healthy = start({ stage: "production" });
    const unhealthy = start({ stage: "production", database: brokenDatabase });
    const paths = [
      "/api/health/live",
      "/api/health/ready",
      "/api/health",
      "/.well-known/forge-health",
    ];
    const ok = await Promise.all(
      paths.map((path) => healthy.fetch(path).then((r) => r.json())),
    );
    const failed = await Promise.all(
      paths.map((path) => unhealthy.fetch(path).then((r) => r.json())),
    );
    expect(shape({ ok, failed })).toMatchInlineSnapshot(`
      {
        "failed": [
          {
            "stage": "production",
            "status": "ok",
          },
          {
            "_tag": "Unhealthy",
            "detail": "database unavailable",
            "status": "unhealthy",
          },
          {
            "_tag": "UnhealthyReport",
            "checks": {
              "database": {
                "message": "Database connection failed",
                "status": "fail",
              },
            },
            "status": "unhealthy",
            "timestamp": "<iso-date>",
            "version": "0.0.0-test",
          },
          {
            "_tag": "ForgeUnhealthy",
            "checks": {
              "database": {
                "checkedAt": "<iso-date>",
                "error": "connection failed",
                "latencyMs": "<number>",
                "status": "unhealthy",
              },
            },
            "status": "unhealthy",
            "timestamp": "<iso-date>",
            "version": "1.0",
          },
        ],
        "ok": [
          {
            "stage": "production",
            "status": "ok",
          },
          {
            "latencyMs": "<number>",
            "status": "ok",
          },
          {
            "checks": {
              "database": {
                "responseTime": "<number>",
                "status": "pass",
              },
            },
            "status": "healthy",
            "timestamp": "<iso-date>",
            "version": "0.0.0-test",
          },
          {
            "checks": {
              "database": {
                "checkedAt": "<iso-date>",
                "latencyMs": "<number>",
                "status": "healthy",
              },
            },
            "status": "healthy",
            "timestamp": "<iso-date>",
            "version": "1.0",
          },
        ],
      }
    `);
  });
});
