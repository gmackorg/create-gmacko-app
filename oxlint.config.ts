import { defineConfig } from "oxlint";

/**
 * Root oxlint configuration.
 *
 * This is a TypeScript config (rather than `.oxlintrc.json`) because oxlint
 * only loads JS plugins from a JS/TS config. The vendored `anti-slop` plugin
 * lives in `tools/oxlint/anti-slop/` — see its README for the upstream commit
 * and how to re-sync.
 */
export default defineConfig({
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    {
      name: "anti-slop-effect",
      specifier: "./tools/oxlint/anti-slop/effect/index.ts",
    },
  ],
  rules: {
    "no-console": "warn",

    // anti-slop: reject low-evidence TypeScript that survives `tsc`.
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    // OFF, deliberately, and the only anti-slop rule that is. The rule bans
    // "shape" in locally-owned symbol names on the grounds that it describes
    // structure rather than ownership. In an Effect 4 codebase it does not:
    // `Context.Key<Identifier, Shape>` and `Context.Service.Shape<T>` are
    // Effect's own public vocabulary for "the interface a service key
    // carries" (node_modules/effect/dist/Context.d.ts). Every one of the ~28
    // `FooShape` types here is exactly that — the second type argument to
    // `Context.Service<Foo, FooShape>` — so the name is borrowed precision,
    // not vagueness. Renaming them would move this repo *away* from the
    // framework's terms. Enable it in a non-Effect fork.
    "anti-slop/no-shape-in-symbol-names": "off",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",

    // Effect group: this repo's server, domain and db packages are Effect 4.
    "anti-slop-effect/no-service-constructor-imports": "error",
  },
  overrides: [
    {
      // Mirrors the `no-cloudflare-env-outside-runtime` app standard
      // (scripts/check-app-standards.mjs) so the editor and the pre-commit
      // hook say it before CI does. `cloudflare:workers` is the Worker's
      // ambient environment; exactly one module turns it into Effect
      // services, and everything else takes those services.
      //
      // Only this one of the nine standards is expressible here. oxlint has
      // `no-restricted-imports` and `no-restricted-globals` and no
      // `no-restricted-syntax`/`no-restricted-properties`, so:
      //   - no-raw-process-env — the scope is the set of workspace packages
      //     reachable from apps/web's package.json, computed per run so a new
      //     dependency joins it on its own. A static glob here would drift
      //     from that graph in both directions.
      //   - no-db-transaction, no-plain-drizzle-in-api — member expressions
      //     (`db.transaction(`, `Database.plain`), which needs a syntax
      //     selector.
      //   - no-server-fn-for-data — a call expression outside one file.
      //   - no-d1-table-rebuild — `.sql` files, which oxlint does not parse.
      //   - no-dev-vars — the existence of a file.
      //   - no-committed-credentials, no-partial-account-deletion — content
      //     patterns and a cross-file completeness check.
      // `pnpm check:standards` remains the authority for all nine, and
      // scripts/__tests__/check-app-standards.test.ts is what pins them.
      files: ["apps/*/src/**", "packages/*/src/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "cloudflare:workers",
                message:
                  "Read bindings through the services apps/web/src/server/runtime.ts builds (AppConfig, Database, Background); only that module touches the Worker's ambient environment.",
              },
            ],
          },
        ],
      },
    },
    {
      // The one importer, and the Workers suites, which read `env` on purpose.
      files: [
        "apps/web/src/server/runtime.ts",
        "**/*.workers.test.ts",
        "**/*.d.ts",
      ],
      rules: {
        "no-restricted-imports": "off",
      },
    },
  ],
  ignorePatterns: [
    // Agent tooling directories. Only the ones this repo actually ships —
    // upstream anti-slop asks for the detected ones, not every dot-directory.
    ".claude/**",
    ".opencode/**",
    "**/.git/**",
    "**/.jj/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/dist/**",
    "**/node_modules/**",
    "apps/web/src/routeTree.gen.ts",
    // The vendored plugin is upstream source, linted upstream, and re-synced
    // verbatim. Linting it here would make every re-sync a fix-up commit.
    "tools/oxlint/anti-slop/**",
  ],
});
