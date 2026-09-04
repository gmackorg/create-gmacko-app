/**
 * `@gmacko/storage`: file uploads on Cloudflare R2.
 *
 * The bucket is an argument, never a module-level global. Production passes
 * the Worker's `env.BUCKET`; the fault lane passes that same binding wrapped
 * in CloudFault's `createR2FaultProxy`. One code path, no conditional, no env
 * switching — the seam is the parameter.
 *
 * Uploads go THROUGH the Worker rather than straight to R2 with a presigned
 * URL, which costs Worker time and is deliberate. A presigned upload never
 * touches the Worker, so it cannot be authorized in one place, cannot be
 * checked against the bytes actually sent (only against a `Content-Length` the
 * client chose), and cannot be fault-injected. `apps/web/fault` exercises this
 * path precisely because the write goes through the binding.
 *
 * Bytes are handled as `Uint8Array` chunks rather than as streams. The package
 * compiles against the DOM lib while R2's signatures come from
 * `@cloudflare/workers-types`, and those two `ReadableStream` types are not
 * assignable to each other; chunks belong to neither universe and need no
 * cast. `readLimited` and `chunksOf` are the only places that touch a stream.
 *
 * Everything here is inert while `integrations.storage.enabled` is false
 * (`gmacko.integrations.json`), which is the template's default.
 */
import type { R2Bucket, R2ObjectBody } from "@cloudflare/workers-types";
import { integrations } from "@gmacko/config";
import { createLogger } from "@gmacko/logging";

const log = createLogger({ module: "storage" });

/** R2's minimum size for every multipart part except the last. */
export const MIN_PART_SIZE = 5 * 1024 * 1024;

/** Whether the storage integration is on. */
export function isStorageEnabled(): boolean {
  return integrations.storage.enabled;
}

/**
 * A request refused before it reached the bucket, carrying the status the
 * caller should see. A bucket failure is not this type: it is a 5xx, and the
 * distinction is what keeps "you sent something invalid" out of the error
 * budget for "we broke".
 */
export class StorageRejected extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "StorageRejected";
    this.status = status;
  }
}

/** Raised when an upload's bytes exceed `maxBytes`, counted as they arrive. */
export class StorageTooLarge extends StorageRejected {
  constructor(maxBytes: number) {
    super(413, `upload exceeds the ${maxBytes} byte limit`);
    this.name = "StorageTooLarge";
  }
}

/**
 * Whether the storage integration is on, for a caller that needs to say so
 * rather than read it: `enabled ?? isStorageEnabled()`.
 *
 * The default is the module-level `integrations.storage.enabled`, which is
 * what production wants and what makes a mounted route inert by default. The
 * override exists for the same reason `bucket` is a parameter — a test and
 * the fault lane have to be able to exercise the enabled path, and a config
 * module read at construction is a global they would otherwise have to mock.
 */
export interface EnabledOption {
  readonly enabled?: boolean;
}

export interface UploadLimits {
  /** Hard ceiling, enforced against bytes received rather than the header. */
  readonly maxBytes: number;
  /** Allowed content types. A trailing `/*` matches a whole type. */
  readonly contentTypes: readonly string[];
}

export interface StoredObject {
  readonly key: string;
  readonly size: number;
  readonly contentType: string;
  readonly uploaded: Date;
}

export interface ListPage {
  readonly objects: readonly StoredObject[];
  /** Present only when more objects remain. */
  readonly cursor?: string;
}

export interface Storage {
  put(
    key: string,
    body: Uint8Array | string,
    options: { contentType: string },
  ): Promise<StoredObject>;
  /**
   * Multipart upload, for a body larger than one request can carry. Parts
   * before the last must reach R2's 5 MiB floor, so `partSize` is clamped up
   * rather than trusted.
   */
  putLarge(
    key: string,
    chunks: AsyncIterable<Uint8Array>,
    options: { contentType: string; partSize?: number },
  ): Promise<StoredObject>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string | readonly string[]): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<ListPage>;
}

/**
 * The R2 binding, as `@cloudflare/workers-types` describes it. Re-exported so
 * a consumer can name the type without taking a direct dependency on the
 * Workers types — and so the one place that has to reconcile it with a
 * generated `worker-configuration.d.ts` has something to point at.
 */
export type StorageBucket = R2Bucket;

export interface StorageOptions {
  /** Prepended to every key, so one bucket can carry more than one app. */
  readonly prefix?: string;
}

export function createStorage(
  bucket: R2Bucket,
  options: StorageOptions = {},
): Storage {
  const prefix = options.prefix ? `${options.prefix.replace(/\/+$/, "")}/` : "";
  const scoped = (key: string) => `${prefix}${key}`;
  const unscoped = (key: string) =>
    prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;

  const described = (
    key: string,
    size: number,
    contentType: string,
    uploaded?: Date,
  ): StoredObject => ({
    key: unscoped(key),
    size,
    contentType,
    uploaded: uploaded ?? new Date(),
  });

  return {
    async put(key, body, { contentType }) {
      // SAFETY: `body` is `Uint8Array | string`. R2 accepts both, but its
      // `put` overloads spell the bytes arm as `ArrayBuffer`, and a
      // `Uint8Array` is not that type even though it is what R2 reads. The
      // assertion names the arm; it does not change what is written.
      const written = body as ArrayBuffer | string;
      const object = await bucket.put(scoped(key), written, {
        httpMetadata: { contentType },
      });
      // R2 `put` resolves to null only when an `onlyIf` precondition fails,
      // and this call sets none. Failing loudly beats a non-null assertion.
      if (!object) throw new Error(`storage: put(${key}) returned no object`);
      return described(object.key, object.size, contentType, object.uploaded);
    },

    async putLarge(key, chunks, { contentType, partSize }) {
      const size = Math.max(partSize ?? MIN_PART_SIZE, MIN_PART_SIZE);
      const upload = await bucket.createMultipartUpload(scoped(key), {
        httpMetadata: { contentType },
      });
      const parts = [];
      let buffered = new Uint8Array(0);
      let total = 0;
      try {
        for await (const chunk of chunks) {
          const next = new Uint8Array(buffered.length + chunk.length);
          next.set(buffered);
          next.set(chunk, buffered.length);
          buffered = next;
          while (buffered.length >= size) {
            const part = buffered.slice(0, size);
            buffered = buffered.slice(size);
            total += part.length;
            parts.push(await upload.uploadPart(parts.length + 1, part));
          }
        }
        // Only the final part may fall below the floor.
        if (buffered.length > 0) {
          total += buffered.length;
          parts.push(await upload.uploadPart(parts.length + 1, buffered));
        }
        if (parts.length === 0) {
          // R2 rejects a completion with no parts, and an empty upload is a
          // legitimate thing for a caller to ask for.
          await upload.abort();
          return await this.put(key, new Uint8Array(0), { contentType });
        }
        await upload.complete(parts);
        return described(scoped(key), total, contentType);
      } catch (error) {
        // A failed multipart upload leaves billable parts behind, so aborting
        // is not optional. If the abort also fails the original error still
        // wins: it is the one that explains what went wrong.
        // The rejection reason of a `catch` handler is `unknown` by
        // construction: it is whatever the binding threw, and this only
        // stringifies it for the log.
        // oxlint-disable-next-line anti-slop/no-unknown-parameters
        await upload.abort().catch((abortError: unknown) => {
          log.warn(
            { key, error: String(abortError) },
            "aborting a failed multipart upload also failed",
          );
        });
        throw error;
      }
    },

    get(key) {
      // SAFETY: `bucket.get(key)` with no `onlyIf`/`range` always resolves to
      // the body-bearing object or null; the narrower arm is only unreachable
      // for the compiler because the overload that takes options can also
      // resolve to a bare `R2Object`.
      return bucket.get(scoped(key)) as Promise<R2ObjectBody | null>;
    },

    async delete(key) {
      // One key or many is the argument's own shape, not a parse of external
      // input: `string | readonly string[]` is a union of two representations
      // and `typeof` is what separates them. R2's `delete` takes both.
      // oxlint-disable-next-line anti-slop/no-runtime-typeof
      const keys = typeof key === "string" ? scoped(key) : key.map(scoped);
      await bucket.delete(keys);
    },

    async list(listOptions = {}) {
      const listed = await bucket.list({
        prefix: scoped(listOptions.prefix ?? ""),
        limit: listOptions.limit,
        cursor: listOptions.cursor,
        // Without this R2 omits `httpMetadata` from every listed object and
        // each one reads back as `application/octet-stream`, whatever it was
        // stored as. It is the same list operation either way.
        include: ["httpMetadata"],
      });
      return {
        objects: listed.objects.map((object) =>
          described(
            object.key,
            object.size,
            object.httpMetadata?.contentType ?? "application/octet-stream",
            object.uploaded,
          ),
        ),
        cursor: listed.truncated ? listed.cursor : undefined,
      };
    },
  };
}

/** `image/png` matches `image/png` or `image/*`; parameters are ignored. */
export function contentTypeAllowed(
  contentType: string,
  allowed: readonly string[],
): boolean {
  const type = (contentType.split(";", 1)[0] ?? "").trim().toLowerCase();
  if (!type) return false;
  return allowed.some((pattern) => {
    const candidate = pattern.trim().toLowerCase();
    if (candidate === type) return true;
    return candidate.endsWith("/*") && type.startsWith(candidate.slice(0, -1));
  });
}

/** Minimal shape of a byte stream reader, satisfied by both stream universes. */
interface ByteStream {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    releaseLock(): void;
  };
}

/** Yields a stream's chunks, so callers never touch a reader directly. */
export async function* chunksOf(stream: ByteStream): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Reads a stream into one buffer, refusing as soon as `maxBytes` is passed.
 * A `Content-Length` header is a claim by the client; this counts what
 * actually arrives, so a lying header cannot get a large body through.
 */
export async function readLimited(
  stream: ByteStream,
  maxBytes: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of chunksOf(stream)) {
    total += chunk.length;
    if (total > maxBytes) throw new StorageTooLarge(maxBytes);
    chunks.push(chunk);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}
