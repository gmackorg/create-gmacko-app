import { describe, expect, it } from "vitest";

import {
  ForgeHealth,
  ForgeUnhealthy,
  HealthApi,
  HealthStatus,
  LiveStatus,
  ReadyStatus,
  Unhealthy,
  UnhealthyReport,
} from "../health";
import { inspectGroup, json, roundTrip, routeTable } from "./helpers";

const t0 = new Date("2026-01-01T00:00:00.000Z");

describe("health models", () => {
  it("live/ready keep the Spike C shapes", () => {
    expect(
      json(LiveStatus).encode(
        new LiveStatus({ status: "ok", stage: "development" }),
      ),
    ).toEqual({ status: "ok", stage: "development" });
    expect(
      json(ReadyStatus).encode(new ReadyStatus({ status: "ok", latencyMs: 3 })),
    ).toEqual({ status: "ok", latencyMs: 3 });
    expect(
      json(Unhealthy).encode(
        new Unhealthy({ status: "unhealthy", detail: "database unavailable" }),
      ),
    ).toEqual({
      _tag: "Unhealthy",
      status: "unhealthy",
      detail: "database unavailable",
    });
  });

  it("full reports per-check results with ISO timestamps", () => {
    const report = new HealthStatus({
      status: "degraded",
      timestamp: t0,
      version: "0.1.0",
      checks: { database: { status: "warn", responseTime: 2100 } },
    });
    expect(json(HealthStatus).encode(report)).toEqual({
      status: "degraded",
      timestamp: "2026-01-01T00:00:00.000Z",
      version: "0.1.0",
      checks: { database: { status: "warn", responseTime: 2100 } },
    });
    expect(roundTrip(HealthStatus, report)).toEqual(report);
    const down = new UnhealthyReport({
      status: "unhealthy",
      timestamp: t0,
      version: "0.1.0",
      checks: {
        database: { status: "fail", message: "Database connection failed" },
      },
    });
    expect(json(UnhealthyReport).encode(down)).toMatchObject({
      _tag: "UnhealthyReport",
      status: "unhealthy",
    });
  });

  it("forge keeps the ForgeGraph 1.0 shape", () => {
    const report = new ForgeHealth({
      status: "healthy",
      version: "1.0",
      timestamp: t0,
      checks: { database: { status: "healthy", latencyMs: 1, checkedAt: t0 } },
    });
    expect(json(ForgeHealth).encode(report)).toEqual({
      status: "healthy",
      version: "1.0",
      timestamp: "2026-01-01T00:00:00.000Z",
      checks: {
        database: {
          status: "healthy",
          latencyMs: 1,
          checkedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    expect(roundTrip(ForgeHealth, report)).toEqual(report);
    expect(
      json(ForgeUnhealthy).encode(
        new ForgeUnhealthy({
          status: "unhealthy",
          version: "1.0",
          timestamp: t0,
          checks: {
            database: {
              status: "unhealthy",
              latencyMs: 5000,
              checkedAt: t0,
              error: "connection failed",
            },
          },
        }),
      ),
    ).toMatchObject({ _tag: "ForgeUnhealthy", status: "unhealthy" });
  });
});

describe("HealthApi", () => {
  it("owns its absolute paths, including the one outside /api", () => {
    expect(routeTable(inspectGroup(HealthApi))).toEqual([
      {
        id: "live",
        method: "GET",
        path: "/api/health/live",
        credential: "public",
        roles: [],
        success: 200,
        errors: [],
      },
      {
        id: "ready",
        method: "GET",
        path: "/api/health/ready",
        credential: "public",
        roles: [],
        success: 200,
        errors: ["503 Unhealthy"],
      },
      {
        id: "full",
        method: "GET",
        path: "/api/health",
        credential: "public",
        roles: [],
        success: 200,
        errors: ["503 UnhealthyReport"],
      },
      {
        id: "forge",
        method: "GET",
        path: "/.well-known/forge-health",
        credential: "public",
        roles: [],
        success: 200,
        errors: ["503 ForgeUnhealthy"],
      },
    ]);
  });
});
