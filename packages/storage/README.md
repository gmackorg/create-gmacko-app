# `@gmacko/storage`

File uploads on **Cloudflare R2**. The package is a thin layer over an
`R2Bucket` binding: the bucket operations (`src/storage.ts`) and the two fetch
handlers that authorize a request and enforce its limits
(`src/handlers.ts`). Everything is inert while `integrations.storage.enabled`
is `false` in `gmacko.integrations.json`, which is the template's default.

The web app mounts it at `apps/web/src/routes/api.storage.$.ts`, with the
policy — key shape, size ceiling, allowed content types — in
`apps/web/src/server/storage.ts`.

## The bucket is a parameter

`createStorage(bucket, { prefix })` takes the bucket; nothing here reads a
module-level global. Production passes the Worker's `env.BUCKET`
(`apps/web/src/server/runtime.ts`, the only module allowed to touch
`cloudflare:workers`), and `apps/web/fault/r2-upload.fault.ts` passes that same
binding wrapped in CloudFault's `createR2FaultProxy`. One code path, no
conditional, no environment switching — the seam is the argument.

## Uploads go through the Worker, not to a presigned URL

The obvious alternative is to hand the browser a presigned S3 URL and let it
PUT straight to R2. That is cheaper in Worker time and it is what most guides
suggest. It is not what this package does, because a presigned upload never
touches the Worker, and three things then become impossible:

- **authorizing in one place.** Whoever holds the URL can write. The check has
  to happen when the URL is minted, and the window between minting and using
  it is yours to reason about.
- **enforcing a size against the bytes actually sent.** You can only bound
  what the client *declared*. `readLimited` counts what arrives and refuses the
  moment the ceiling is passed, so a request whose `Content-Length` says 10 and
  whose body sends 4096 is still a 413.
- **fault injection.** The write is not a binding call, so there is nothing to
  interpose on. The R2 scenario in the fault lane exists precisely because the
  write goes through the binding.

The cost is real: the body passes through the isolate's memory, so the app's
`maxBytes` is set well below the Worker's 100 MB request limit. `putLarge`
streams to R2 in parts for bodies past that, and is what to reach for if the
ceiling has to rise.

## What moving off a managed uploader costs

R2 is a bucket, not a service. Everything a managed uploader would have done
for you is now the app's job:

| | a managed uploader | R2, here |
| --- | --- | --- |
| Virus / malware scanning | included | **none.** Nothing scans an uploaded file. Treat everything in the bucket as untrusted bytes, and never serve it from the app's own origin without thinking about it. |
| A CDN URL per file | included | **none.** Objects are private. They come back through `GET /api/storage/<key>`, which costs a Worker invocation per read. A public bucket on a custom domain is a separate decision. |
| A dashboard to find and delete a file | included | **none.** `storage.list()` and `storage.delete()`, or `wrangler r2 object`. |
| File-type rules | declared on the route | `contentTypeAllowed` in `src/storage.ts`, against `limits.contentTypes`. Refused with **415** before the body is read. |
| Size rules | declared on the route | `readLimited` in `src/storage.ts`. The `Content-Length` header is refused with **413** first as a courtesy; the byte count is the actual control, and it also answers **413**. |
| Authorization | a middleware on the route | the `authorize` option, and the key namespace. A caller may only read a key under its own id (`ownNamespace` in `src/handlers.ts`), and a key outside it answers **404, not 403** — a 403 would confirm the object exists. |
| Cost | per GB stored + transferred | per GB stored; **no egress fees**, but every read is a Worker request. |

Those enforcement points are all in `src/handlers.ts`, not spread across
callers, because a route that forgets one is the whole vulnerability. The tests
for them are `src/storage.workers.test.ts`, on a real R2 binding on workerd.

## Enabling it

1. Set `integrations.storage` to `{ "enabled": true, "provider": "r2" }` in
   `gmacko.integrations.json` (and `packages/config/src/integrations.ts`).
2. Create the buckets, one per stage:

   ```sh
   pnpm -F @gmacko/web exec wrangler r2 bucket create gmacko-web
   pnpm -F @gmacko/web exec wrangler r2 bucket create gmacko-web-preview
   pnpm -F @gmacko/web exec wrangler r2 bucket create gmacko-web-staging
   ```

   The `r2_buckets` binding is already in `apps/web/wrangler.jsonc`, restated
   in all four scopes — Cloudflare environments do **not** inherit bindings.
   Local development needs no bucket and no setup: the Cloudflare Vite plugin
   runs Miniflare from that same config, so `pnpm dev` materialises `BUCKET`
   under `apps/web/.wrangler/state/v3/r2`.
3. Adjust the policy in `apps/web/src/server/storage.ts` — `uploadLimits`,
   `STORAGE_PREFIX`, and `uploadKey`.

There is no token and no account to create beyond the bucket: R2 reaches the
Worker as a binding, so there is nothing to put in `pnpm secrets:push`.

## Using it

```sh
# Upload. `Idempotency-Key` is optional but see below.
curl -X POST https://example.com/api/storage \
  -H 'content-type: image/png' \
  -H 'idempotency-key: avatar-v1' \
  --data-binary @avatar.png
# => { "key": "<user id>/avatar-v1", "size": 8123, "contentType": "image/png", … }

# Download.
curl https://example.com/api/storage/<key>
```

### Retry under the same key

An R2 write can commit and lose its response: the object lands, the Worker is
told it failed, and it answers 500. A client that retries under a *fresh* key
then leaves the first object behind — referenced by nothing, listed by
nothing, billed every month. `uploadKey` avoids that by honouring an
`Idempotency-Key` header, so a retry overwrites instead of accumulating, and
`apps/web/fault/r2-upload.fault.ts` injects exactly that fault and holds the
property. Send one from any client that retries.

## Tests

- `pnpm --filter @gmacko/storage test` — Node. The two pure guards
  (`contentTypeAllowed`, `readLimited`) and the disabled-integration path.
- `pnpm --filter @gmacko/storage test:workers` — workerd, against a real
  Miniflare R2. Round trips, prefix scoping, `list` paging, a genuine
  multi-part `putLarge` (over 5 MiB, because R2 enforces that floor on every
  part but the last), and every refusal above.

`putLarge` has no fault scenario yet: the multipart faults
(`r2MultipartCommitThenTimeout`, `r2PartUploadError`,
`r2PartialMultipartCompletion`) land in `@gmacko/cloudfault` 0.2.0, and the
lane is pinned to `^0.1.0`.
