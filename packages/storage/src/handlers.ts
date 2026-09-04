/**
 * The two fetch handlers: one to accept an upload, one to serve a file back.
 * Mount them from TanStack Start server routes, which hand over the `Request`
 * and send back the `Response`.
 *
 * A managed uploader enforced content type, size and authorization for us. On
 * R2 those are ours, and they are all here rather than spread across callers:
 * a route that forgets one is the whole vulnerability.
 *
 * Both handlers read `enabled` at construction and, when it is off, return an
 * inert 404 handler that never touches the bucket. It defaults to
 * `integrations.storage.enabled`, and is an option so that the enabled path
 * can be exercised without mocking the config module.
 */
import type { R2Bucket } from "@cloudflare/workers-types";

import {
  contentTypeAllowed,
  createStorage,
  type EnabledOption,
  isStorageEnabled,
  readLimited,
  StorageRejected,
  type StoredObject,
  type UploadLimits,
} from "./storage";

/** Who is uploading. `id` namespaces the object key. */
export interface UploadIdentity {
  readonly id: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Returns the caller's identity, or null to refuse with a 401. */
export type Authorize = (request: Request) => Promise<UploadIdentity | null>;

export interface UploadHandlerOptions extends EnabledOption {
  readonly bucket: R2Bucket;
  readonly authorize: Authorize;
  readonly limits: UploadLimits;
  /** Prepended to every key; passed through to `createStorage`. */
  readonly prefix?: string;
  /**
   * Where the object lands. The default namespaces by identity, so one caller
   * cannot overwrite another's object. Override only with that in mind.
   */
  readonly key?: (identity: UploadIdentity, request: Request) => string;
}

export interface DownloadHandlerOptions extends EnabledOption {
  readonly bucket: R2Bucket;
  readonly authorize: Authorize;
  readonly prefix?: string;
  /**
   * Whether this caller may read this key. The default allows a caller only
   * its own namespace, matching the upload handler's default key.
   */
  readonly canRead?: (identity: UploadIdentity, key: string) => boolean;
}

/** Everything either handler answers with, refusals included. */
type ResponseBody =
  | StoredObject
  | {
      readonly error: string;
      readonly accepted?: readonly string[];
    };

const json = (status: number, body: ResponseBody) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A disabled integration answers 404, so a mounted route is inert, not a 500. */
const disabled = () => json(404, { error: "storage is not enabled" });

const ownNamespace = (identity: UploadIdentity, key: string) =>
  key === identity.id || key.startsWith(`${identity.id}/`);

/**
 * `POST /api/storage` with the file as the raw request body and the type in
 * `content-type`. Answers `{ key, size, contentType, uploaded }`.
 */
export function createUploadHandler(
  options: UploadHandlerOptions,
): (request: Request) => Promise<Response> {
  if (!(options.enabled ?? isStorageEnabled())) {
    return () => Promise.resolve(disabled());
  }

  const storage = createStorage(options.bucket, { prefix: options.prefix });
  const keyFor =
    options.key ??
    ((identity: UploadIdentity) => `${identity.id}/${crypto.randomUUID()}`);

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST" && request.method !== "PUT") {
      return json(405, { error: "use POST or PUT" });
    }

    const identity = await options.authorize(request);
    if (!identity) return json(401, { error: "not authorized to upload" });

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentTypeAllowed(contentType, options.limits.contentTypes)) {
      return json(415, {
        error: `content type ${contentType || "(none)"} is not accepted`,
        accepted: options.limits.contentTypes,
      });
    }

    // Refuse an oversized upload on its header before reading a byte, then
    // enforce the same limit against what actually arrives. The header is a
    // courtesy to the client; the byte count is the control.
    const declared = Number(request.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > options.limits.maxBytes) {
      return json(413, {
        error: `upload exceeds the ${options.limits.maxBytes} byte limit`,
      });
    }
    if (!request.body) return json(400, { error: "request has no body" });

    let stored: StoredObject;
    try {
      const body = await readLimited(request.body, options.limits.maxBytes);
      stored = await storage.put(keyFor(identity, request), body, {
        contentType,
      });
    } catch (error) {
      if (error instanceof StorageRejected)
        return json(error.status, { error: error.message });
      throw error;
    }
    return json(200, stored);
  };
}

/**
 * `GET /api/storage/<key>`. The key is everything after `basePath`, so a key
 * may contain slashes.
 */
export function createDownloadHandler(
  options: DownloadHandlerOptions & { readonly basePath: string },
): (request: Request) => Promise<Response> {
  if (!(options.enabled ?? isStorageEnabled())) {
    return () => Promise.resolve(disabled());
  }

  const storage = createStorage(options.bucket, { prefix: options.prefix });
  const canRead = options.canRead ?? ownNamespace;

  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json(405, { error: "use GET" });
    }

    const identity = await options.authorize(request);
    if (!identity) return json(401, { error: "not authorized" });

    const { pathname } = new URL(request.url);
    const key = decodeURIComponent(
      pathname.slice(options.basePath.replace(/\/$/, "").length + 1),
    );
    if (!key) return json(400, { error: "no key" });

    // Answer 404 rather than 403 for a key the caller may not read: a 403
    // confirms the object exists, which is itself a disclosure.
    if (!canRead(identity, key)) return json(404, { error: "not found" });

    const object = await storage.get(key);
    if (!object) return json(404, { error: "not found" });

    const headers = new Headers({
      "content-type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
      "content-length": String(object.size),
      etag: object.httpEtag,
    });
    if (request.method === "HEAD")
      return new Response(null, { status: 200, headers });
    // SAFETY: R2 hands back workerd's `ReadableStream` and `Response` here is
    // typed from the DOM lib — the same object at runtime, two declarations
    // that know nothing of each other. There is no single assertion between
    // them, and nothing to parse: the bytes are forwarded untouched.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions
    const body = object.body as unknown as ReadableStream;
    return new Response(body, { status: 200, headers });
  };
}
