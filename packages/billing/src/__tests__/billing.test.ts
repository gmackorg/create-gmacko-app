import { describe, expect, it } from "vitest";

import {
  evaluateLimit,
  resolveWorkspacePlan,
  rollupMeterUsage,
} from "../index";

describe("billing helpers", () => {
  const freePlan = {
    id: "plan_free",
    key: "free",
    name: "Free",
    isDefault: true,
  };

  const proPlan = {
    id: "plan_pro",
    key: "pro",
    name: "Pro",
    isDefault: false,
  };

  it("resolves the subscribed workspace plan and falls back to the default plan", () => {
    expect(
      resolveWorkspacePlan({
        plans: [freePlan, proPlan],
        subscription: {
          workspaceId: "ws_1",
          planId: proPlan.id,
          status: "active",
        },
      }),
    ).toMatchObject({ key: "pro" });

    expect(
      resolveWorkspacePlan({
        plans: [freePlan, proPlan],
        subscription: null,
      }),
    ).toMatchObject({ key: "free" });
  });

  it("enforces finite limits against current usage", () => {
    expect(
      evaluateLimit({
        currentUsage: 2,
        amount: 1,
        limit: {
          key: "projects",
          value: 3,
        },
      }),
    ).toEqual({
      allowed: true,
      currentUsage: 2,
      exceededBy: 0,
      key: "projects",
      limit: 3,
      nextUsage: 3,
      remaining: 0,
    });

    expect(
      evaluateLimit({
        currentUsage: 3,
        amount: 1,
        limit: {
          key: "projects",
          value: 3,
        },
      }),
    ).toEqual({
      allowed: false,
      currentUsage: 3,
      exceededBy: 1,
      key: "projects",
      limit: 3,
      nextUsage: 4,
      remaining: 0,
    });
  });

  it("rolls up meter usage by workspace, meter, and billing period", () => {
    const rollup = rollupMeterUsage({
      records: [
        {
          workspaceId: "ws_1",
          meterId: "meter_api_calls",
          quantity: 4,
          occurredAt: new Date("2026-03-01T00:00:00.000Z"),
        },
        {
          workspaceId: "ws_1",
          meterId: "meter_api_calls",
          quantity: 6,
          occurredAt: new Date("2026-03-05T00:00:00.000Z"),
        },
        {
          workspaceId: "ws_1",
          meterId: "meter_storage",
          quantity: 2,
          occurredAt: new Date("2026-03-06T00:00:00.000Z"),
        },
        {
          workspaceId: "ws_2",
          meterId: "meter_api_calls",
          quantity: 99,
          occurredAt: new Date("2026-03-07T00:00:00.000Z"),
        },
        {
          workspaceId: "ws_1",
          meterId: "meter_api_calls",
          quantity: 8,
          occurredAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
      workspaceId: "ws_1",
      meterId: "meter_api_calls",
      periodStart: new Date("2026-03-01T00:00:00.000Z"),
      periodEnd: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(rollup).toEqual({
      meterId: "meter_api_calls",
      periodEnd: new Date("2026-04-01T00:00:00.000Z"),
      periodStart: new Date("2026-03-01T00:00:00.000Z"),
      quantity: 10,
      workspaceId: "ws_1",
    });
  });
});
