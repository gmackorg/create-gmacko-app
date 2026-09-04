/**
 * `@gmacko/storage` against a real R2 binding on workerd.
 *
 * Miniflare's R2 is the same implementation the Worker talks to in
 * production, so the things a hand-written double would happily agree with
 * are actually checked here: that a prefixed key is a *different key* and not
 * a filter, that `list` really pages, and that `putLarge` performs a genuine
 * multipart upload — R2 enforces the 5 MiB floor on every part but the last,
 * so a body under that size cannot prove anything about the multipart path.
 *
 * The handler suite runs with `enabled: true`, because the integration flag
 * is false in the template's `gmacko.integrations.json` and the handlers read
 * it at construction. That option is the seam, not a mocked config module:
 * it is the same reason `bucket` is a parameter. What the handlers do once
 * storage is on is exactly what a managed uploader used to do for the app —
 * content type, size and authorization — and is the point of this file.
 */

import { env } from "cloudflare:workers";
import type { R2Bucket } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createDownloadHandler,
  createStorage,
  createUploadHandler,
  isStorageEnabled,
  MIN_PART_SIZE,
  type StoredObject,
  type UploadIdentity,
  type UploadLimits,
} from "./index";

const bucket: R2Bucket = env.BUCKET;

/**
 * `Uint8Array<ArrayBuffer>`, not the default `Uint8Array<ArrayBufferLike>`:
 * the DOM lib's `BufferSource` (and so `BodyInit`) excludes a view over a
 * `SharedArrayBuffer`, which is what `new Uint8Array(n)` widens to.
 */
const bytes = (length: number, fill = 0x61): Uint8Array<ArrayBuffer> =>
  new Uint8Array(new ArrayBuffer(length)).fill(fill);

/** Yields `body` in fixed-size chunks, the way a request stream arrives. */
async function* inChunks(
  body: Uint8Array,
  size: number,
): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < body.length; offset += size) {
    yield body.subarray(offset, Math.min(offset + size, body.length));
  }
}

/**
 * A POST whose body is a stream and whose `content-length` is whatever the
 * caller claims — which is the point: the header is a claim, and the tests
 * below check what happens when it is a lie.
 *
 * SAFETY: `duplex: "half"` is required by the Fetch spec for a streaming
 * request body and is what workerd implements, but the DOM lib's
 * `RequestInit` has no such field, so there is no type to widen to.
 */
const streamed = (body: ReadableStream<Uint8Array>, length: string): Request =>
  new Request("https://example.com/api/storage", {
    method: "POST",
    headers: { "content-type": "image/png", "content-length": length },
    body,
    duplex: "half",
  } as RequestInit);

/** Empties the bucket, so each test starts from the same state. */
const emptyBucket = async (): Promise<void> => {
  for (;;) {
    const listed = await bucket.list({ limit: 1000 });
    if (listed.objects.length === 0) return;
    await bucket.delete(listed.objects.map((object) => object.key));
    if (!listed.truncated) return;
  }
};

beforeEach(emptyBucket);

it("builds its handlers with the flag off, so the option is the seam", () => {
  // The template ships storage disabled. Nothing below turns that on
  // globally; each handler is told, which is what keeps this file honest
  // about the module it is testing.
  expect(isStorageEnabled()).toBe(false);
});

describe("createStorage against a real bucket", () => {
  it("round-trips an object through put and get", async () => {
    const storage = createStorage(bucket);
    const stored = await storage.put("hello.txt", "hello r2", {
      contentType: "text/plain",
    });
    expect(stored).toMatchObject({
      key: "hello.txt",
      size: 8,
      contentType: "text/plain",
    });

    const read = await storage.get("hello.txt");
    expect(read).not.toBeNull();
    expect(await read?.text()).toBe("hello r2");
    expect(read?.httpMetadata?.contentType).toBe("text/plain");
  });

  it("answers null for a key that was never written", async () => {
    expect(await createStorage(bucket).get("absent")).toBeNull();
  });

  it("writes a prefixed key, and that key is invisible under another prefix", async () => {
    const tenantA = createStorage(bucket, { prefix: "tenant-a" });
    const tenantB = createStorage(bucket, { prefix: "tenant-b" });
    await tenantA.put("report", "a's report", { contentType: "text/plain" });

    // The prefix is part of the key, not a filter applied afterwards.
    expect(await bucket.head("tenant-a/report")).not.toBeNull();
    expect(await bucket.head("report")).toBeNull();

    // Same key, different prefix: a different object, and it does not exist.
    expect(await tenantB.get("report")).toBeNull();
    expect(await (await tenantA.get("report"))?.text()).toBe("a's report");

    // The prefix never leaks back out in the key a caller sees.
    const listed = await tenantA.list();
    expect(listed.objects.map((object) => object.key)).toEqual(["report"]);
  });

  it("tolerates a trailing slash on the prefix rather than doubling it", async () => {
    await createStorage(bucket, { prefix: "tenant-a/" }).put("x", "1", {
      contentType: "text/plain",
    });
    expect(await bucket.head("tenant-a/x")).not.toBeNull();
    expect(await bucket.head("tenant-a//x")).toBeNull();
  });

  it("deletes one key and a batch of keys", async () => {
    const storage = createStorage(bucket, { prefix: "tenant-a" });
    await storage.put("one", "1", { contentType: "text/plain" });
    await storage.put("two", "2", { contentType: "text/plain" });
    await storage.put("three", "3", { contentType: "text/plain" });

    await storage.delete("one");
    expect(await storage.get("one")).toBeNull();
    expect(await storage.get("two")).not.toBeNull();

    await storage.delete(["two", "three"]);
    expect((await storage.list()).objects).toEqual([]);
    // And nothing outside the prefix was touched on the way.
    expect((await bucket.list()).objects).toEqual([]);
  });

  it("pages through list with a cursor", async () => {
    const storage = createStorage(bucket, { prefix: "tenant-a" });
    for (const name of ["a", "b", "c", "d", "e"]) {
      await storage.put(name, name, { contentType: "text/plain" });
    }

    const first = await storage.list({ limit: 2 });
    expect(first.objects.map((object) => object.key)).toEqual(["a", "b"]);
    expect(first.cursor).toBeTypeOf("string");

    const second = await storage.list({ limit: 2, cursor: first.cursor });
    expect(second.objects.map((object) => object.key)).toEqual(["c", "d"]);
    expect(second.cursor).toBeTypeOf("string");

    const third = await storage.list({ limit: 2, cursor: second.cursor });
    expect(third.objects.map((object) => object.key)).toEqual(["e"]);
    // The last page has no cursor, which is how a caller knows to stop.
    expect(third.cursor).toBeUndefined();
  });

  it("reports the stored content type through list", async () => {
    const storage = createStorage(bucket);
    await storage.put("logo.png", bytes(4), { contentType: "image/png" });
    const [object] = (await storage.list()).objects;
    expect(object).toMatchObject({
      key: "logo.png",
      size: 4,
      contentType: "image/png",
    });
    expect(object?.uploaded).toBeInstanceOf(Date);
  });
});

/**
 * R2 reports a multipart object's etag as `"<hash>-<parts>"` and a single
 * `put`'s with no suffix at all. That is durable, R2-native evidence of how an
 * object was written, readable long after the call that wrote it — which is
 * what these tests assert against, rather than counting calls on a wrapper
 * that would only ever agree with the code under test.
 */
const partCount = (etag: string | undefined): number => {
  const suffix = /-(\d+)"?$/.exec(etag ?? "");
  return suffix === null ? 0 : Number(suffix[1]);
};

describe("putLarge", () => {
  it("performs a real multipart upload once the body passes R2's part floor", async () => {
    // 6 MiB in 1 MiB chunks: one full 5 MiB part, then a 1 MiB remainder.
    // Anything smaller could not be multipart at all — R2 rejects a
    // non-final part below 5 MiB — so this is the smallest honest test.
    const total = 6 * 1024 * 1024;
    const storage = createStorage(bucket, { prefix: "tenant-a" });

    const stored = await storage.putLarge(
      "big.bin",
      inChunks(bytes(total, 0x5a), 1024 * 1024),
      { contentType: "application/octet-stream" },
    );
    expect(stored).toMatchObject({ size: total });

    const object = await bucket.head("tenant-a/big.bin");
    expect(object?.size).toBe(total);
    expect(partCount(object?.httpEtag)).toBe(2);

    const read = await storage.get("big.bin");
    if (read === null) throw new Error("tenant-a/big.bin was not stored");
    const body = new Uint8Array(await read.arrayBuffer());
    expect(body.length).toBe(total);
    expect(body[0]).toBe(0x5a);
    expect(body[total - 1]).toBe(0x5a);
  });

  it("clamps a part size below R2's floor rather than letting the bucket refuse it", async () => {
    const total = 6 * 1024 * 1024;
    const storage = createStorage(bucket);

    // 64 KiB would be rejected by R2 for every part but the last; `putLarge`
    // raises it to MIN_PART_SIZE, so this is still two parts, not ninety-six.
    await storage.putLarge("clamped.bin", inChunks(bytes(total), 1024 * 1024), {
      contentType: "application/octet-stream",
      partSize: 64 * 1024,
    });

    expect(MIN_PART_SIZE).toBe(5 * 1024 * 1024);
    const object = await bucket.head("clamped.bin");
    expect(object?.size).toBe(total);
    expect(partCount(object?.httpEtag)).toBe(2);
  });

  it("stores a body under the floor as a single final part", async () => {
    const storage = createStorage(bucket);
    const stored = await storage.putLarge(
      "small.bin",
      inChunks(bytes(64), 16),
      {
        contentType: "application/octet-stream",
      },
    );
    expect(stored.size).toBe(64);
    const object = await bucket.head("small.bin");
    expect(object?.size).toBe(64);
    expect(partCount(object?.httpEtag)).toBe(1);
  });

  it("falls back to put for an empty body, which R2 will not complete as multipart", async () => {
    const storage = createStorage(bucket);
    const stored = await storage.putLarge("empty.bin", inChunks(bytes(0), 16), {
      contentType: "application/octet-stream",
    });
    expect(stored.size).toBe(0);
    const object = await bucket.head("empty.bin");
    expect(object?.size).toBe(0);
    // No `-n` suffix: a plain `put`, not a completed multipart upload.
    expect(partCount(object?.httpEtag)).toBe(0);
  });
});

/**
 * The handlers own the entire upload policy: who may upload, what they may
 * upload, and how much of it. Every case below is a refusal that has to
 * happen before the bytes reach the bucket.
 */
describe("createUploadHandler", () => {
  const limits: UploadLimits = {
    maxBytes: 1024,
    contentTypes: ["image/png", "text/*"],
  };
  const asUser = (id: string | null) => () =>
    Promise.resolve(id === null ? null : ({ id } satisfies UploadIdentity));

  /** The upload route's success body, as the handler documents it. */
  const storedFrom = (response: Response): Promise<StoredObject> =>
    response.json();

  const upload = (
    identity: string | null,
    init: { headers?: Record<string, string>; body?: BodyInit } = {},
  ) => {
    const handle = createUploadHandler({
      bucket,
      enabled: true,
      authorize: asUser(identity),
      limits,
      prefix: "uploads",
    });
    return handle(
      new Request("https://example.com/api/storage", {
        method: "POST",
        headers: { "content-type": "image/png", ...init.headers },
        body: init.body ?? bytes(16),
      }),
    );
  };

  it("stores the body and reports the key it landed under", async () => {
    const response = await upload("user-a", { body: bytes(16, 0x42) });
    expect(response.status).toBe(200);
    const stored = await storedFrom(response);
    expect(stored.size).toBe(16);
    expect(stored.key.startsWith("user-a/")).toBe(true);

    // The handler's `prefix` is on the bucket key, not on the key it reports.
    const object = await bucket.get(`uploads/${stored.key}`);
    if (object === null) throw new Error(`${stored.key} was not stored`);
    expect(new Uint8Array(await object.arrayBuffer())[0]).toBe(0x42);
  });

  it("refuses an unauthorized caller with 401, before anything is stored", async () => {
    const response = await upload(null);
    expect(response.status).toBe(401);
    expect((await bucket.list()).objects).toEqual([]);
  });

  it("refuses a disallowed content type with 415", async () => {
    const response = await upload("user-a", {
      headers: { "content-type": "application/zip" },
    });
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({
      accepted: ["image/png", "text/*"],
    });
    expect((await bucket.list()).objects).toEqual([]);
  });

  it("refuses a missing content type with 415", async () => {
    // An empty `content-type` is not "unknown, allow it": it is unlisted.
    const response = await upload("user-a", {
      headers: { "content-type": "" },
    });
    expect(response.status).toBe(415);
  });

  it("accepts a content type carrying parameters", async () => {
    const response = await upload("user-a", {
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: "hello",
    });
    expect(response.status).toBe(200);
  });

  it("refuses an oversized declared content-length with 413, without reading the body", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes(64));
        controller.close();
      },
    });
    const request = streamed(body, String(limits.maxBytes + 1));
    const handle = createUploadHandler({
      bucket,
      enabled: true,
      authorize: asUser("user-a"),
      limits,
    });

    const response = await handle(request);
    expect(response.status).toBe(413);
    // The point of checking the header first: a client that announces a
    // gigabyte is refused without the Worker consuming a gigabyte. `bodyUsed`
    // is false only while the body stream is undisturbed, so this is the
    // reading, not an assertion about the response.
    expect(request.bodyUsed).toBe(false);
    expect((await bucket.list()).objects).toEqual([]);
  });

  it("still refuses with 413 when the body lies about its content-length and sends more", async () => {
    // The header is a claim by the client. `readLimited` counts what actually
    // arrives, so a small `content-length` in front of a large body buys
    // nothing — this is the case a header-only check would let through.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes(4096));
        controller.close();
      },
    });
    const handle = createUploadHandler({
      bucket,
      enabled: true,
      authorize: asUser("user-a"),
      limits,
    });
    const response = await handle(streamed(body, "10"));
    expect(response.status).toBe(413);
    expect((await bucket.list()).objects).toEqual([]);
  });

  it("refuses a method that is not an upload", async () => {
    const handle = createUploadHandler({
      bucket,
      enabled: true,
      authorize: asUser("user-a"),
      limits,
    });
    const response = await handle(
      new Request("https://example.com/api/storage", { method: "GET" }),
    );
    expect(response.status).toBe(405);
  });

  it("namespaces the default key by identity, so one caller cannot overwrite another's object", async () => {
    const first = await upload("user-a", { body: bytes(16) });
    const second = await upload("user-b", { body: bytes(16) });
    const keyA = (await storedFrom(first)).key;
    const keyB = (await storedFrom(second)).key;

    expect(keyA.startsWith("user-a/")).toBe(true);
    expect(keyB.startsWith("user-b/")).toBe(true);
    expect(keyA).not.toBe(keyB);

    // Two objects, in two namespaces: nothing was overwritten.
    const listed = await bucket.list();
    expect(listed.objects).toHaveLength(2);
    expect(
      listed.objects.every((object) => object.key.startsWith("uploads/")),
    ).toBe(true);
  });

  it("gives the same caller a fresh key each time rather than clobbering their last upload", async () => {
    const one = (await storedFrom(await upload("user-a"))).key;
    const two = (await storedFrom(await upload("user-a"))).key;
    expect(one).not.toBe(two);
    expect((await bucket.list()).objects).toHaveLength(2);
  });
});

describe("createDownloadHandler", () => {
  const basePath = "/api/storage";
  const asUser = (id: string | null) => () =>
    Promise.resolve(id === null ? null : ({ id } satisfies UploadIdentity));

  const handlerFor = (identity: string | null) =>
    createDownloadHandler({
      bucket,
      enabled: true,
      authorize: asUser(identity),
      prefix: "uploads",
      basePath,
    });

  const seed = () =>
    createStorage(bucket, { prefix: "uploads" }).put(
      "user-a/secret.txt",
      "user a's file",
      { contentType: "text/plain" },
    );

  it("serves the caller's own object", async () => {
    await seed();
    const response = await handlerFor("user-a")(
      new Request(`https://example.com${basePath}/user-a/secret.txt`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("content-length")).toBe("13");
    expect(await response.text()).toBe("user a's file");
  });

  it("answers HEAD with the metadata and no body", async () => {
    await seed();
    const response = await handlerFor("user-a")(
      new Request(`https://example.com${basePath}/user-a/secret.txt`, {
        method: "HEAD",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("13");
    expect(await response.text()).toBe("");
  });

  it("answers 404, not 403, for a key outside the caller's namespace", async () => {
    await seed();
    const refused = await handlerFor("user-b")(
      new Request(`https://example.com${basePath}/user-a/secret.txt`),
    );
    const missing = await handlerFor("user-b")(
      new Request(`https://example.com${basePath}/user-b/nothing-here.txt`),
    );

    // Byte-identical to a genuinely missing key. A 403 would confirm the
    // object exists, which is itself a disclosure: it turns the download
    // route into an oracle for other tenants' filenames.
    expect(refused.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await refused.json()).toEqual(await missing.json());
  });

  it("does not treat a shared prefix as the same namespace", async () => {
    // `user-a` must not open `user-abc/...` just because one id is a prefix
    // of the other; the boundary is a path segment, not a string prefix.
    await createStorage(bucket, { prefix: "uploads" }).put(
      "user-abc/file.txt",
      "someone else",
      { contentType: "text/plain" },
    );
    const response = await handlerFor("user-a")(
      new Request(`https://example.com${basePath}/user-abc/file.txt`),
    );
    expect(response.status).toBe(404);
  });

  it("refuses an unauthorized caller with 401", async () => {
    await seed();
    const response = await handlerFor(null)(
      new Request(`https://example.com${basePath}/user-a/secret.txt`),
    );
    expect(response.status).toBe(401);
  });

  it("answers 400 when the path carries no key", async () => {
    const response = await handlerFor("user-a")(
      new Request(`https://example.com${basePath}/`),
    );
    expect(response.status).toBe(400);
  });

  it("refuses a method that is not a read", async () => {
    const response = await handlerFor("user-a")(
      new Request(`https://example.com${basePath}/user-a/secret.txt`, {
        method: "DELETE",
      }),
    );
    expect(response.status).toBe(405);
  });
});
