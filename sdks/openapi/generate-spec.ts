#!/usr/bin/env tsx
/**
 * OpenAPI spec generation script
 *
 * Generates openapi.json from the tRPC API definition.
 * Run with: pnpm tsx sdks/openapi/generate-spec.ts
 */
import { writeFileSync } from "fs";
import { resolve } from "path";

import type { OpenApiConfig } from "@gmacko/api/openapi";
import { generateApiDocument } from "@gmacko/api/openapi";

const config: Partial<OpenApiConfig> = {
  title: process.env.API_TITLE ?? "Gmacko API",
  version: process.env.API_VERSION ?? "1.0.0",
  description: process.env.API_DESCRIPTION ?? "API for your gmacko application",
  baseUrl: process.env.API_BASE_URL ?? "https://api.example.com",
};

const spec = generateApiDocument(config);
const outputPath = resolve(import.meta.dirname, "openapi.json");

writeFileSync(outputPath, JSON.stringify(spec, null, 2));

console.log(`OpenAPI spec generated at ${outputPath}`);
console.log(`  Title: ${spec.info.title}`);
console.log(`  Version: ${spec.info.version}`);
console.log(`  Paths: ${Object.keys(spec.paths ?? {}).length}`);
