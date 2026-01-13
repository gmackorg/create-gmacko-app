#!/usr/bin/env tsx
/**
 * SDK Generation Script
 *
 * Generates SDKs from the OpenAPI spec using openapi-generator-cli.
 * Supports Python, Go, Ruby, Java, Kotlin, Swift, and Rust.
 *
 * Usage:
 *   pnpm generate              # Generate TypeScript SDK (default)
 *   pnpm generate --language python
 *   pnpm generate --all        # Generate all SDKs
 */
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { resolve } from "path";

interface LanguageConfig {
  generator: string;
  outputDir: string;
  additionalProperties?: Record<string, string>;
  templateDir?: string;
}

const LANGUAGES: Record<string, LanguageConfig> = {
  python: {
    generator: "python",
    outputDir: "sdks/generated/python",
    additionalProperties: {
      packageName: "gmacko_client",
      projectName: "gmacko-client",
    },
  },
  go: {
    generator: "go",
    outputDir: "sdks/generated/go",
    additionalProperties: {
      packageName: "gmacko",
      moduleName: "github.com/gmackorg/gmacko-go-client",
    },
  },
  ruby: {
    generator: "ruby",
    outputDir: "sdks/generated/ruby",
    additionalProperties: {
      gemName: "gmacko_client",
      moduleName: "GmackoClient",
    },
  },
  java: {
    generator: "java",
    outputDir: "sdks/generated/java",
    additionalProperties: {
      groupId: "io.gmacko",
      artifactId: "gmacko-client",
      apiPackage: "io.gmacko.client.api",
      modelPackage: "io.gmacko.client.model",
      invokerPackage: "io.gmacko.client",
    },
  },
  kotlin: {
    generator: "kotlin",
    outputDir: "sdks/generated/kotlin",
    additionalProperties: {
      groupId: "io.gmacko",
      artifactId: "gmacko-client",
      packageName: "io.gmacko.client",
    },
  },
  swift: {
    generator: "swift5",
    outputDir: "sdks/generated/swift",
    additionalProperties: {
      projectName: "GmackoClient",
      swiftPackagePath: "GmackoClient",
    },
  },
  rust: {
    generator: "rust",
    outputDir: "sdks/generated/rust",
    additionalProperties: {
      packageName: "gmacko_client",
    },
  },
  typescript: {
    generator: "typescript-fetch",
    outputDir: "sdks/generated/typescript",
    additionalProperties: {
      npmName: "@gmacko/api-client",
      supportsES6: "true",
      typescriptThreePlus: "true",
    },
  },
};

const ROOT_DIR = resolve(import.meta.dirname, "../..");
const SPEC_PATH = resolve(ROOT_DIR, "sdks/openapi/openapi.json");

function parseArgs(): { languages: string[]; all: boolean } {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const languageIndex = args.indexOf("--language");

  if (all) {
    return { languages: Object.keys(LANGUAGES), all: true };
  }

  if (languageIndex !== -1 && args[languageIndex + 1]) {
    return { languages: [args[languageIndex + 1]], all: false };
  }

  return { languages: ["typescript"], all: false };
}

function generateSdk(language: string): void {
  const config = LANGUAGES[language];
  if (!config) {
    console.error(`Unknown language: ${language}`);
    console.error(`Available languages: ${Object.keys(LANGUAGES).join(", ")}`);
    process.exit(1);
  }

  const outputPath = resolve(ROOT_DIR, config.outputDir);

  // Create output directory
  if (!existsSync(outputPath)) {
    mkdirSync(outputPath, { recursive: true });
  }

  // Build additional properties string
  const additionalProps = config.additionalProperties
    ? Object.entries(config.additionalProperties)
        .map(([k, v]) => `${k}=${v}`)
        .join(",")
    : "";

  // Build command
  const cmd = [
    "npx",
    "@openapitools/openapi-generator-cli",
    "generate",
    `-i ${SPEC_PATH}`,
    `-g ${config.generator}`,
    `-o ${outputPath}`,
    additionalProps ? `--additional-properties=${additionalProps}` : "",
    config.templateDir ? `--template-dir=${config.templateDir}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  console.log(`\nGenerating ${language} SDK...`);
  console.log(`  Output: ${outputPath}`);

  try {
    execSync(cmd, { stdio: "inherit", cwd: ROOT_DIR });
    console.log(`  Done!`);
  } catch (error) {
    console.error(`  Failed to generate ${language} SDK`);
    throw error;
  }
}

function main(): void {
  // Check if spec exists
  if (!existsSync(SPEC_PATH)) {
    console.error(`OpenAPI spec not found at ${SPEC_PATH}`);
    console.error("Run 'pnpm -F @gmacko/openapi-spec generate' first");
    process.exit(1);
  }

  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf-8"));
  console.log(`Using OpenAPI spec: ${spec.info.title} v${spec.info.version}`);

  const { languages, all } = parseArgs();

  if (all) {
    console.log(`Generating SDKs for all languages: ${languages.join(", ")}`);
  }

  for (const language of languages) {
    generateSdk(language);
  }

  console.log("\nAll SDKs generated successfully!");
}

main();
