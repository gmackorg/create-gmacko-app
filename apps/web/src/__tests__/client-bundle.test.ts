/**
 * The browser bundle must never carry the Workers Sentry SDK: walks the
 * first-party import graph from the client entry (`src/client.tsx`,
 * relative and `~/` imports, `@gmacko/*` packages through their `exports`)
 * and asserts nothing on it imports `@sentry/cloudflare`, the server entry
 * of `@gmacko/monitoring`, or that package's root (which re-exports the
 * native SDK too). The Worker-only modules (`make-worker.ts`, `worker.ts`) are
 * expected to stay off the graph.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const APP = resolve(import.meta.dirname, "../..");
const SRC = join(APP, "src");
const PACKAGES = resolve(APP, "../../packages");

/**
 * The workspace scope, read from this app's own name rather than hard-coded,
 * so the test keeps its teeth in a scaffold generated with `--package-scope`.
 */
const SCOPE = (
  JSON.parse(readFileSync(join(APP, "package.json"), "utf8")) as {
    name: string;
  }
).name.split("/")[0]!;

/** Exact specifiers (the package roots also match their subpaths). */
const FORBIDDEN_EXACT = new Set([
  `${SCOPE}/monitoring`,
  `${SCOPE}/monitoring/web/server`,
]);
const FORBIDDEN_PACKAGES = ["@sentry/cloudflare", "@sentry/react-native"];
const isForbidden = (spec: string): boolean =>
  FORBIDDEN_EXACT.has(spec) ||
  FORBIDDEN_PACKAGES.some((f) => spec === f || spec.startsWith(`${f}/`));

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?)\s*from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|(?:^|\n)\s*import\s+["']([^"']+)["']/g;

const specifiers = (source: string): string[] => {
  const out: string[] = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) out.push(spec.replace(/\?.*$/, ""));
  }
  return out;
};

const EXT = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];
const asFile = (base: string): string | undefined => {
  for (const ext of EXT) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      try {
        if (readFileSync(candidate).length >= 0) return candidate;
      } catch {
        // a directory; try the next
      }
    }
  }
  return undefined;
};

/** `<scope>/<pkg>[/<sub>]` → the source file its `exports` names (default condition). */
const WORKSPACE_SPEC = new RegExp(
  `^${SCOPE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^/]+)(/.*)?$`,
);
const workspaceFile = (spec: string): string | undefined => {
  const m = WORKSPACE_SPEC.exec(spec);
  if (!m) return undefined;
  const dir = join(PACKAGES, m[1]!);
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return undefined;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    exports?: Record<string, string | { default?: string }>;
  };
  const key = `.${m[2] ?? ""}`;
  const entry = pkg.exports?.[key];
  const target = typeof entry === "string" ? entry : entry?.default;
  if (!target) return undefined;
  if (target.includes("*")) return undefined; // asset patterns (messages/*)
  return asFile(join(dir, target));
};

const resolveSpec = (spec: string, from: string): string | undefined => {
  if (spec.startsWith("~/")) return asFile(join(SRC, spec.slice(2)));
  if (spec.startsWith(".")) return asFile(resolve(dirname(from), spec));
  return workspaceFile(spec);
};

/** Every first-party file reachable from `entries`, and every bare specifier seen on the way. */
const walk = (entries: string[]) => {
  const files = new Set<string>();
  const bare = new Map<string, string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (files.has(file)) continue;
    files.add(file);
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    for (const spec of specifiers(readFileSync(file, "utf8"))) {
      if (!spec.startsWith(".") && !spec.startsWith("~/")) bare.set(spec, file);
      const next = resolveSpec(spec, file);
      if (next) queue.push(next);
    }
  }
  return { files, bare };
};

describe("the client entry graph", () => {
  // Start loads `router.tsx` by convention (not through an import from
  // `client.tsx`), so both are roots of the browser graph.
  const { files, bare } = walk([
    join(SRC, "client.tsx"),
    join(SRC, "router.tsx"),
  ]);

  it("reaches the routes, the workspace packages and the browser Sentry entry", () => {
    expect([...files].some((f) => f.endsWith("/routes/__root.tsx"))).toBe(true);
    // The walk follows workspace `exports` too, or the assertion below would
    // only ever see apps/web's own imports.
    expect([...files].some((f) => f.startsWith(`${PACKAGES}/`))).toBe(true);
    expect(bare.has(`${SCOPE}/monitoring/web`)).toBe(true);
  });

  it("never imports the Workers Sentry SDK or the monitoring server entry", () => {
    const hits = [...bare.entries()].filter(([spec]) => isForbidden(spec));
    expect(hits).toEqual([]);
    for (const f of files) {
      expect(f.endsWith("/server/make-worker.ts")).toBe(false);
      expect(f.endsWith("/server/worker.ts")).toBe(false);
    }
  });
});
