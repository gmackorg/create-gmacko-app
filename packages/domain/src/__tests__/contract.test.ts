/**
 * The ForgeGraph contract compiled from `AppApi`: one operation per endpoint
 * with a stable semantic id, visibility, derived authentication and SLA.
 * Pinned as a snapshot so a contract change is a visible diff, and checked
 * against `inspectApi` so the two reflections of the same `HttpApi` cannot
 * disagree about what is public or which credential an endpoint takes.
 */
import { serializeContract, validateContract } from "@forgegraph/contract";
import { compileHttpApi } from "@forgegraph/contract/effect";
import { describe, expect, it } from "vitest";

import { AppApi } from "../api";
import { inspectApi } from "../inspect";

const SERVICE_ID = "gmacko";
const contract = compileHttpApi(AppApi, { serviceId: SERVICE_ID });
const rows = inspectApi(AppApi);
const byId = new Map(contract.operations.map((op) => [op.id, op]));

describe("ForgeGraph contract", () => {
  it("compiles to a valid IR with one operation per endpoint", () => {
    expect(validateContract(contract).ok).toBe(true);
    expect(contract.serviceId).toBe(SERVICE_ID);
    expect(contract.operations).toHaveLength(rows.length);
    for (const row of rows) {
      expect(byId.has(`${SERVICE_ID}.${row.group}.${row.id}`), row.id).toBe(
        true,
      );
    }
  });

  it("agrees with inspectApi on route, credential and roles", () => {
    for (const row of rows) {
      const op = byId.get(`${SERVICE_ID}.${row.group}.${row.id}`)!;
      expect(op.transport).toMatchObject({
        method: row.method,
        path: row.path,
      });
      const { authentication } = op.policy;
      expect(authentication.mismatch, row.id).toBe(false);
      switch (row.credential) {
        case "public":
          expect(authentication.mode, row.id).toBe("anonymous");
          break;
        case "Session":
          expect(authentication.mode, row.id).toBe("user");
          break;
        default:
          // SessionOrKey(scope): cookie session or bearer key.
          expect(authentication.mode, row.id).toBe("mixed");
      }
      expect(op.middleware.filter((m) => m.security).map((m) => m.key)).toEqual(
        row.securityMiddlewares,
      );
    }
  });

  it("marks exactly the credential-less endpoints public, everything else private", () => {
    // Visibility is declared, not derived (IsPublic is orthogonal to auth);
    // this pins the policy that in this template the two coincide.
    for (const row of rows) {
      const op = byId.get(`${SERVICE_ID}.${row.group}.${row.id}`)!;
      expect(op.policy.isPublic, `${row.method} ${row.path}`).toBe(
        row.credential === "public",
      );
    }
  });

  it("inherits the service-level SLA on every operation with provenance", () => {
    for (const op of contract.operations) {
      expect(op.policy.sla.policy.availability, op.id).toBeGreaterThan(0);
      expect(op.policy.sla.provenance.availability, op.id).toBe("api");
    }
  });

  it("matches the committed contract document", async () => {
    await expect(`${serializeContract(contract)}\n`).toMatchFileSnapshot(
      "./__snapshots__/contract.json",
    );
  });
});
