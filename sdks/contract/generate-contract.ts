#!/usr/bin/env tsx
/**
 * ForgeGraph contract generation: `compileHttpApi(AppApi)` over the contract
 * in @gmacko/domain, written to sdks/contract/contract.json (gitignored).
 * The same document is pinned by packages/domain's snapshot test
 * (src/__tests__/__snapshots__/contract.json); the SDK workflow's drift
 * check diffs this output against that snapshot, and `fg contract publish`
 * sends it to ForgeGraph so the app's operations, SLA and visibility are
 * exactly what the tests ran against.
 *
 * The service id is the app slug from .forgegraph.yaml (`app:`), which is
 * also the `service.name` the Worker reports, so declared and observed
 * operations join on `<app>.<group>.<endpoint>`.
 *
 * Run with: pnpm -F @gmacko/contract-spec generate
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { serializeContract } from "@forgegraph/contract";
import { compileHttpApi } from "@forgegraph/contract/effect";
import { AppApi } from "@gmacko/domain";

const repoRoot = resolve(import.meta.dirname, "../..");

/** `app:` from .forgegraph.yaml, without taking a YAML parser dependency. */
const serviceIdFromRepoConfig = (): string => {
  const yaml = readFileSync(resolve(repoRoot, ".forgegraph.yaml"), "utf8");
  const match = /^app:\s*([A-Za-z][A-Za-z0-9_-]*)\s*$/m.exec(yaml);
  if (!match?.[1]) {
    throw new Error(
      ".forgegraph.yaml has no `app:` line; cannot derive the service id",
    );
  }
  return match[1];
};

const serviceId = process.env.FG_APP ?? serviceIdFromRepoConfig();
const contract = compileHttpApi(AppApi, { serviceId });
const outputPath = resolve(import.meta.dirname, "contract.json");

writeFileSync(outputPath, `${serializeContract(contract)}\n`);

const publicCount = contract.operations.filter(
  (op) => op.policy.isPublic,
).length;
console.log(`ForgeGraph contract generated at ${outputPath}`);
console.log(`  Service: ${contract.serviceId} (api ${contract.apiId})`);
console.log(
  `  Operations: ${contract.operations.length} (${publicCount} public)`,
);
console.log(`  Fingerprint: ${contract.fingerprint}`);
