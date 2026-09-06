#!/usr/bin/env tsx
/**
 * OpenAPI spec generation: `OpenApi.fromApi(AppApi)`, the contract in
 * @gmacko/domain, written to sdks/openapi/openapi.json (gitignored). The
 * same document is pinned by packages/domain's snapshot test
 * (src/__tests__/__snapshots__/openapi.json); the SDK workflow's drift check
 * diffs this output against that snapshot, so the SDKs are generated from
 * exactly the contract the tests ran against.
 *
 * Run with: pnpm -F @gmacko/openapi-spec generate
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { AppApi } from "@gmacko/domain";
import { OpenApi } from "effect/unstable/httpapi";

const spec = OpenApi.fromApi(AppApi);
const outputPath = resolve(import.meta.dirname, "openapi.json");

writeFileSync(outputPath, JSON.stringify(spec, null, 2));

console.log(`OpenAPI spec generated at ${outputPath}`);
console.log(`  Title: ${spec.info.title}`);
console.log(`  Version: ${spec.info.version}`);
console.log(`  Paths: ${Object.keys(spec.paths).length}`);
