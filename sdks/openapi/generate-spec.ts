#!/usr/bin/env tsx
/**
 * OpenAPI spec generation script
 *
 * Generates openapi.json from the tRPC API definition.
 * Run with: pnpm tsx sdks/openapi/generate-spec.ts
 *
 * Supports versioned generation:
 *   API_VERSION=v1 pnpm tsx sdks/openapi/generate-spec.ts
 *   API_VERSION=all pnpm tsx sdks/openapi/generate-spec.ts  # Generate all versions
 */
import { writeFileSync } from "fs";
import { resolve } from "path";

import type { OpenApiConfig } from "@gmacko/api/openapi";
import {
  generateAllVersionedSpecs,
  generateApiDocument,
  getAvailableApiVersions,
} from "@gmacko/api/openapi";

import type { ApiVersion } from "../../packages/api/src/versioning";

const baseConfig: Partial<OpenApiConfig> = {
  title: process.env.API_TITLE ?? "Gmacko API",
  version: process.env.API_VERSION ?? "1.0.0",
  description: process.env.API_DESCRIPTION ?? "API for your gmacko application",
  baseUrl: process.env.API_BASE_URL ?? "https://api.example.com",
};

const targetVersion = process.env.API_VERSION_TARGET ?? "v1";

if (targetVersion === "all") {
  // Generate specs for all API versions
  console.log("Generating OpenAPI specs for all API versions...\n");

  const specs = generateAllVersionedSpecs(baseConfig);
  const versions = getAvailableApiVersions();

  for (let i = 0; i < versions.length; i++) {
    const version = versions[i];
    if (version) {
      const spec = specs[version];
      const outputPath = resolve(
        import.meta.dirname,
        `openapi-${version}.json`,
      );

      writeFileSync(outputPath, JSON.stringify(spec, null, 2));

      console.log(`Generated ${outputPath}`);
      console.log(`  Title: ${spec.info.title}`);
      console.log(`  Version: ${spec.info.version}`);
      console.log(`  Paths: ${Object.keys(spec.paths ?? {}).length}\n`);
    }
  }

  // Also generate a "latest" spec (pointing to v1 for backward compatibility)
  const latestSpec = generateApiDocument({
    ...baseConfig,
    apiVersion: "v1",
    includeVersionInPaths: false, // Unversioned paths for backward compatibility
  });
  const latestPath = resolve(import.meta.dirname, "openapi.json");
  writeFileSync(latestPath, JSON.stringify(latestSpec, null, 2));
  console.log(`Generated ${latestPath} (default/latest spec)`);
} else {
  // Generate spec for a specific version
  const apiVersion = targetVersion as ApiVersion;
  const spec = generateApiDocument({
    ...baseConfig,
    apiVersion,
  });

  const outputPath = resolve(
    import.meta.dirname,
    targetVersion === "v1" ? "openapi.json" : `openapi-${targetVersion}.json`,
  );

  writeFileSync(outputPath, JSON.stringify(spec, null, 2));

  console.log(`OpenAPI spec generated at ${outputPath}`);
  console.log(`  Title: ${spec.info.title}`);
  console.log(`  API Version: ${apiVersion}`);
  console.log(`  Spec Version: ${spec.info.version}`);
  console.log(`  Paths: ${Object.keys(spec.paths ?? {}).length}`);
}
