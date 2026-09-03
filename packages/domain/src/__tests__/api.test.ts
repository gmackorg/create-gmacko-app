/**
 * The assembled contract: 35 endpoints (31 procedures + 4 health), every
 * non-public one behind exactly one security middleware, and the OpenAPI
 * document pinned as a snapshot so a change to the contract is a visible
 * diff.
 */
import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { describe, expect, it } from "vitest";

import { AppApi } from "../api";
import { inspectApi } from "../inspect";

const rows = inspectApi(AppApi as unknown as HttpApi.Top);
const route = (row: { method: string; path: string }) =>
  `${row.method} ${row.path}`;

/** The public list is closed: adding a public endpoint means editing this. */
const PUBLIC = [
  "GET /api/health/live",
  "GET /api/health/ready",
  "GET /api/health",
  "GET /.well-known/forge-health",
  "GET /api/auth/session",
  "GET /api/posts",
  "GET /api/posts/:id",
  "GET /api/launch-state",
  "POST /api/waitlist",
  "GET /api/bootstrap",
];

describe("AppApi", () => {
  it("declares 35 endpoints: auth 2, posts 4, settings 14, admin 11, health 4", () => {
    const byGroup: Record<string, number> = {};
    for (const row of rows) byGroup[row.group] = (byGroup[row.group] ?? 0) + 1;
    expect(byGroup).toEqual({
      auth: 2,
      posts: 4,
      settings: 14,
      admin: 11,
      health: 4,
    });
    expect(rows).toHaveLength(35);
  });

  it("prefixes everything with /api except the ForgeGraph probe", () => {
    for (const row of rows) {
      if (row.id === "forge") {
        expect(row.path).toBe("/.well-known/forge-health");
      } else {
        expect(row.path.startsWith("/api/")).toBe(true);
      }
    }
    expect(new Set(rows.map(route)).size).toBe(rows.length);
  });

  it("puts every non-public endpoint behind exactly one security middleware", () => {
    const publicRows = rows.filter((row) => row.credential === "public");
    expect(publicRows.map(route).sort()).toEqual([...PUBLIC].sort());
    for (const row of rows) {
      if (PUBLIC.includes(route(row))) {
        expect(row.securityMiddlewares).toEqual([]);
        expect(row.roles).toEqual([]);
      } else {
        expect(row.securityMiddlewares, route(row)).toHaveLength(1);
        expect(row.credential, route(row)).toMatch(
          /^(Session|SessionOrKey\((read|write|delete|admin)\))$/,
        );
      }
    }
  });

  it("gives role checks a credential to read from", () => {
    for (const row of rows.filter((r) => r.roles.length > 0)) {
      expect(row.credential, route(row)).not.toBe("public");
      expect(row.roles.length, route(row)).toBe(1);
    }
    expect(
      rows
        .filter((r) => r.path.startsWith("/api/admin/"))
        .every((r) => r.roles.includes("AdminOnly")),
    ).toBe(true);
  });

  it("matches the committed OpenAPI document", async () => {
    const spec = OpenApi.fromApi(AppApi);
    expect(Object.keys(spec.paths)).toHaveLength(
      new Set(rows.map((row) => row.path)).size,
    );
    expect(spec.components.securitySchemes).toEqual({
      session: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
      },
      apiKey: { type: "http", scheme: "Bearer" },
    });
    await expect(JSON.stringify(spec, null, 2)).toMatchFileSnapshot(
      "./__snapshots__/openapi.json",
    );
  });
});
