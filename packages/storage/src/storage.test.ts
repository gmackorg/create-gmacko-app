/**
 * The parts of `@gmacko/storage` that need no bucket: the two pure guards
 * (`contentTypeAllowed`, `readLimited`) and the disabled-integration path.
 *
 * These run on Node because nothing here touches R2. The bucket operations
 * and the handlers' security behaviour are in `storage.workers.test.ts`,
 * against a real R2 binding on workerd — a fake bucket would prove nothing
 * about the thing this package exists to do.
 */

import type { R2Bucket } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import {
  contentTypeAllowed,
  createDownloadHandler,
  createUploadHandler,
  isStorageEnabled,
  readLimited,
  StorageTooLarge,
} from "./index";

/**
 * `Uint8Array<ArrayBuffer>`, not the default `Uint8Array<ArrayBufferLike>`:
 * the DOM lib's `BufferSource` (and so `BodyInit`) excludes a view over a
 * `SharedArrayBuffer`, which is what `new Uint8Array(n)` widens to.
 */
const bytes = (length: number, fill = 0x61): Uint8Array<ArrayBuffer> =>
  new Uint8Array(new ArrayBuffer(length)).fill(fill);

/**
 * A byte stream whose chunks are produced only when read, recording how many
 * were handed over. A real `ReadableStream` queues one chunk ahead of the
 * reader, which would blur the very thing `readLimited` promises: that it
 * stops pulling the moment the limit is passed.
 */
const countedStream = (chunks: readonly Uint8Array[]) => {
  let index = 0;
  let released = false;
  return {
    get delivered() {
      return index;
    },
    get released() {
      return released;
    },
    stream: {
      getReader: () => ({
        read: () =>
          Promise.resolve(
            index < chunks.length
              ? { done: false, value: chunks[index++] }
              : { done: true },
          ),
        releaseLock: () => {
          released = true;
        },
      }),
    },
  };
};

describe("contentTypeAllowed", () => {
  it("matches an exact type", () => {
    expect(contentTypeAllowed("image/png", ["image/png"])).toBe(true);
    expect(contentTypeAllowed("image/png", ["image/jpeg", "image/png"])).toBe(
      true,
    );
  });

  it("matches a whole type through a trailing /*", () => {
    expect(contentTypeAllowed("image/png", ["image/*"])).toBe(true);
    expect(contentTypeAllowed("image/svg+xml", ["image/*"])).toBe(true);
    expect(contentTypeAllowed("text/plain", ["image/*"])).toBe(false);
  });

  it("ignores parameters and case", () => {
    expect(contentTypeAllowed("text/plain;charset=utf-8", ["text/plain"])).toBe(
      true,
    );
    expect(
      contentTypeAllowed("TEXT/PLAIN; charset=UTF-8", ["text/plain"]),
    ).toBe(true);
    expect(contentTypeAllowed(" image/png ; q=1", ["IMAGE/*"])).toBe(true);
  });

  it("refuses an empty or unlisted type", () => {
    expect(contentTypeAllowed("", ["image/*"])).toBe(false);
    expect(contentTypeAllowed(";charset=utf-8", ["text/plain"])).toBe(false);
    expect(contentTypeAllowed("application/zip", ["image/*", "text/*"])).toBe(
      false,
    );
  });

  it("does not let a prefix match a different type", () => {
    // `image/*` is the only wildcard form; `image` alone must not match, and
    // `text/plain` must not match `text/plainish`.
    expect(contentTypeAllowed("imagefoo/png", ["image/*"])).toBe(false);
    expect(contentTypeAllowed("text/plainish", ["text/plain"])).toBe(false);
  });

  it("refuses when nothing is allowed", () => {
    expect(contentTypeAllowed("image/png", [])).toBe(false);
  });
});

describe("readLimited", () => {
  it("returns the concatenated bytes when the body fits", async () => {
    const source = countedStream([bytes(3, 1), bytes(2, 2)]);
    const body = await readLimited(source.stream, 16);
    expect(Array.from(body)).toEqual([1, 1, 1, 2, 2]);
    expect(source.released).toBe(true);
  });

  it("accepts a body of exactly the limit", async () => {
    const body = await readLimited(countedStream([bytes(8)]).stream, 8);
    expect(body.length).toBe(8);
  });

  it("refuses one byte past the limit", async () => {
    await expect(
      readLimited(countedStream([bytes(9)]).stream, 8),
    ).rejects.toBeInstanceOf(StorageTooLarge);
  });

  it("reports 413 on the rejection, not a generic failure", async () => {
    // The status is the point: a handler turns this straight into the
    // response, so "too large" must not read as a 500.
    await expect(
      readLimited(countedStream([bytes(9)]).stream, 8),
    ).rejects.toMatchObject({ name: "StorageTooLarge", status: 413 });
  });

  it("stops reading as soon as the limit is passed, rather than buffering the body first", async () => {
    // Ten chunks of 100 bytes against a 250 byte ceiling: the third chunk is
    // the one that crosses it, and nothing after it may ever be pulled. A
    // handler that read the whole body and *then* measured it would be a
    // memory exhaustion vector on a request that lies about its size.
    const source = countedStream(Array.from({ length: 10 }, () => bytes(100)));
    await expect(readLimited(source.stream, 250)).rejects.toBeInstanceOf(
      StorageTooLarge,
    );
    expect(source.delivered).toBe(3);
    expect(source.released).toBe(true);
  });

  it("reads a real ReadableStream, not only the test double", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes(4, 7));
        controller.close();
      },
    });
    const body = await readLimited(stream, 16);
    expect(Array.from(body)).toEqual([7, 7, 7, 7]);
  });
});

describe("with the storage integration disabled", () => {
  // The template ships `integrations.storage.enabled: false`, so a route left
  // mounted must be inert rather than a 500 — and must not reach the bucket,
  // which is why the handlers are given one that would throw if touched.
  // SAFETY: the empty object never answers a property read — the handler
  // below is asserted to be the inert one, so every access is the failure this
  // proxy exists to report. Nothing is ever called on the asserted type.
  const unreachable = {} as R2Bucket;
  const bucket = new Proxy(unreachable, {
    get(_target, property) {
      throw new Error(`storage touched the bucket: ${String(property)}`);
    },
  });
  const authorize = () => {
    throw new Error("storage authorized a request while disabled");
  };

  it("reports the integration as off", () => {
    expect(isStorageEnabled()).toBe(false);
  });

  it("answers 404 from an upload route left mounted", async () => {
    const handle = createUploadHandler({
      bucket,
      authorize,
      limits: { maxBytes: 1024, contentTypes: ["image/*"] },
    });
    const response = await handle(
      new Request("https://example.com/api/storage", {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: bytes(4),
      }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "storage is not enabled" });
  });

  it("answers 404 from a download route left mounted", async () => {
    const handle = createDownloadHandler({
      bucket,
      authorize,
      basePath: "/api/storage",
    });
    const response = await handle(
      new Request("https://example.com/api/storage/user-1/file"),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "storage is not enabled" });
  });
});
