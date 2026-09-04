import { createFileRoute } from "@tanstack/react-router";

import { storageDownloadHandler, storageUploadHandler } from "~/server/runtime";

/**
 * The file storage route, both directions:
 *
 *   - `POST` (or `PUT`) `/api/storage` — the file as the raw request body,
 *     its type in `content-type`, and optionally an `Idempotency-Key`.
 *     Answers `{ key, size, contentType, uploaded }`.
 *   - `GET` (or `HEAD`) `/api/storage/<key>` — the object's bytes with its
 *     stored `content-type`.
 *
 * One splat route, not two files. `/api/storage/$` matches the bare
 * `/api/storage` as well as a key beneath it, and it *shadows* a sibling
 * static `/api/storage` route: with both present, a request to `/api/storage`
 * matches the splat, finds no handler for its method, and falls through to
 * the SSR render — a POST silently answers a 200 HTML page. Splitting the two
 * directions across files is the version that does not work.
 *
 * The splat is ignored on upload: the key is the server's to choose
 * (`uploadKey` in `~/server/storage`), because a client-named key is a client
 * that can name someone else's.
 *
 * More specific than `/api/$`, so it wins over the HttpApi catch-all. Storage
 * is not an HttpApi endpoint because the contract carries typed JSON and this
 * takes an opaque byte stream that has to be counted as it arrives rather
 * than decoded — see packages/storage/README.md.
 *
 * Authorization, the content-type allow-list, the size ceiling and the
 * namespace check all live in the handlers `~/server/runtime` builds from the
 * policy in `~/server/storage`. A key outside the caller's namespace answers
 * 404, not 403: a 403 would confirm the object exists, which turns this route
 * into an oracle for other people's filenames.
 */
export const Route = createFileRoute("/api/storage/$")({
  server: {
    handlers: {
      POST: ({ request }) => storageUploadHandler(request),
      PUT: ({ request }) => storageUploadHandler(request),
      GET: ({ request }) => storageDownloadHandler(request),
      HEAD: ({ request }) => storageDownloadHandler(request),
    },
  },
});
