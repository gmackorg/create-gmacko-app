# `@gmacko/storage`

File uploads for the web lane. **UploadThing is the default**, and this
package is the thin seam around it: the `f` builder, the fetch route handler,
and the guards that keep everything inert while
`integrations.storage.enabled` is `false` in `gmacko.integrations.json` (the
template's default).

Everything here runs on Cloudflare Workers. `uploadthing/server` is the fetch
adapter — a `Request` in, a `Response` out — and uses only `fetch`, `crypto`
and `Blob`. `src/storage.workers.test.ts` runs the real route handler on
workerd (`@cloudflare/vitest-pool-workers`) so that stays true; the Node suite
in `src/storage.test.ts` covers the disabled path.

> Do **not** import `uploadthing/next`. It pulls in `next/server`, and the web
> lane has had no Next.js since the Phase 8 cutover of the TanStack + Effect +
> D1 migration.

## Enabling it

1. Set `integrations.storage` to `{ "enabled": true, "provider": "uploadthing" }`
   in `gmacko.integrations.json`.
2. Put the app's UploadThing token in the Worker's secrets
   (`pnpm secrets:push --stage <stage>`), and read it from the bindings.
   Never `process.env`: the Worker has no ambient environment (AGENTS.md).
3. Declare the routes and mount the handler from a TanStack Start server
   route:

```ts
// apps/web/src/routes/api/uploadthing.ts
import { createFileRouter, createStorageHandler } from "@gmacko/storage";
import { createFileRoute } from "@tanstack/react-router";

const f = createFileRouter();

const router = {
  avatar: f?.({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(({ req }) => authorize(req))
    .onUploadComplete(({ metadata, file }) => ({
      userId: metadata.userId,
      url: file.ufsUrl,
    })),
};

// `token` comes from the Worker's bindings, through the runtime module.
const handle = createStorageHandler({ router, config: { token } });

export const Route = createFileRoute("/api/uploadthing")({
  server: { handlers: { ANY: ({ request }) => handle(request) } },
});
```

The browser uploads straight to UploadThing with a signed URL, so the file
bytes never pass through the Worker and neither the request-size nor the CPU
limit applies to the upload itself.

## Why UploadThing is the default

It is the only one of the two options that is a *service*. Signed upload URLs,
a CDN, file-type and size enforcement, virus scanning, a dashboard to find and
delete a file, and per-file metadata all come with it, and there is nothing to
operate. For a template whose whole point is to be running in an afternoon,
that is the right default.

## The alternative: Cloudflare R2

Choose R2 when the files must stay on your own Cloudflare account, when you
need them in the same network as the Worker (an R2 binding is a zero-egress,
zero-latency read from the Worker), or when the volume makes UploadThing's
per-gigabyte pricing the larger line item. R2 has no egress fees.

What you take on by moving:

| | UploadThing | R2 |
| --- | --- | --- |
| Direct browser upload | signed URL, built in | you issue a presigned URL (S3 API) or proxy through the Worker |
| Upload size ceiling | the service's | 100 MB per Worker request if proxied; multipart or presigned to go past it |
| File type / size rules | declared on the route | yours to enforce before the write |
| Virus scanning | included | not included |
| Public URLs | CDN URL per file | a custom domain on the bucket, or signed URLs |
| Deleting, listing, renaming | `UTApi` | the R2 binding (`env.BUCKET.delete/list`) or the S3 API |
| Cost | per GB stored + transferred | per GB stored, no egress |

Sketch of the move, when you want it:

1. `wrangler r2 bucket create gmacko-web-<stage>`, and add an `r2_buckets`
   binding to every environment in `apps/web/wrangler.jsonc` (environments do
   not inherit bindings — restate them), then `pnpm cf-typegen`.
2. Add `provider: "r2"` to `integrations.storage` in `packages/config` and
   implement the same three exports here against the binding:
   `createStorageHandler` becomes a route that issues a presigned PUT (or
   accepts a body under 100 MB and calls `env.BUCKET.put`), and
   `createStorageApi` wraps `env.BUCKET`.
3. Keep the enforcement UploadThing was doing for you: content type, size,
   and an authorization check before the URL is issued.
4. Point the client at the new route; the upload component's contract (pick a
   file, get a URL back) does not have to change.

This is a separate task, not a switch to flip: nothing in the repo implements
the R2 path today.
