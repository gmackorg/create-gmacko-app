/**
 * `cloudflare:workers` for the workers suite only, declaring the one binding
 * `vitest.workers.config.ts` provides (`r2Buckets: ["BUCKET"]`).
 *
 * The whole module is declared here rather than pulled in with
 * `/// <reference types="@cloudflare/workers-types" />`, which is a global
 * script: it would define `Request`, `Response` and `ReadableStream` on top of
 * this package's `lib: ["ES2022", "DOM"]` and every one of them would be a
 * duplicate identifier. `R2Bucket` comes in as a *type import* instead, which
 * is exactly how src/storage.ts takes it.
 */
declare module "cloudflare:workers" {
  export const env: {
    readonly BUCKET: import("@cloudflare/workers-types").R2Bucket;
  };
}
