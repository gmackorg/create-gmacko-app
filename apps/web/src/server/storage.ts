/**
 * The app's upload policy and the two handlers built from it: where objects
 * land, who may read them, what may be uploaded, and how much of it.
 *
 * This is also the app's only `@gmacko/storage` importer, which is what lets
 * the scaffolder prune the package: `runtime.ts` (which binds `env.BUCKET`
 * and the session read) and the two route files depend on this module, not on
 * the package. With storage pruned, the scaffolder replaces this file with a
 * stub of the same shape and nothing else has to change.
 */
import {
  type Authorize,
  createDownloadHandler,
  createUploadHandler,
  type EnabledOption,
  type StorageBucket,
  type UploadIdentity,
  type UploadLimits,
} from "@gmacko/storage";

/**
 * The route's path. The download handler slices this off the pathname to get
 * the key, so it must match `routes/api.storage.$.ts` exactly.
 */
export const STORAGE_BASE_PATH = "/api/storage";

/**
 * Prepended to every object key, so this app's objects stay identifiable in a
 * bucket that may hold more than one thing. It is invisible to callers: the
 * key in an upload response and in a download URL is the unprefixed one.
 */
export const STORAGE_PREFIX = "uploads";

/**
 * Uploads pass through the Worker (see packages/storage/README.md on why not
 * a presigned URL), and `readLimited` holds the body in the isolate's memory
 * while it counts. A Worker isolate has 128 MB, and it is also serving the
 * app, so the ceiling here is well under what a single Worker request could
 * carry (100 MB) rather than at it. Raise it only alongside a switch to
 * `putLarge`, which streams to R2 in parts instead of buffering.
 *
 * The content types are an allow-list, not a deny-list. R2 stores whatever it
 * is handed and scans nothing, so anything not named here is refused with a
 * 415 before a byte reaches the bucket.
 */
export const uploadLimits: UploadLimits = {
  maxBytes: 8 * 1024 * 1024,
  contentTypes: [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
  ],
};

/**
 * A client-supplied `Idempotency-Key`, restricted to characters that make a
 * sane object key. Anything else is ignored rather than rejected: the header
 * is an optimisation, and an upload with a malformed one is still a valid
 * upload.
 */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Where one upload lands.
 *
 * Always under `<user id>/`, which is the boundary the download route checks:
 * whatever a client puts in `Idempotency-Key`, it can only ever name an
 * object inside its own namespace.
 *
 * Within that namespace the key is the idempotency key when the client sends
 * one, and a fresh UUID otherwise. That distinction is the whole point. R2's
 * write can commit and still lose its response — the Worker sees a failure
 * for an object that is already there — and a client that retries under a
 * fresh UUID would then leave the first object behind: paid for monthly,
 * referenced by nothing, invisible to the user who uploaded it. Retrying
 * under the same key overwrites instead, so the retry costs one write rather
 * than one write plus one orphan. `apps/web/fault/r2-upload.fault.ts` injects
 * exactly that fault and checks the property holds.
 */
export const uploadKey = (
  identity: UploadIdentity,
  request: Request,
): string => {
  const supplied = request.headers.get("idempotency-key");
  const name =
    supplied !== null && IDEMPOTENCY_KEY.test(supplied)
      ? supplied
      : crypto.randomUUID();
  return `${identity.id}/${name}`;
};

/** The two fetch handlers `routes/api.storage.$.ts` mounts. */
export interface StorageHandlers {
  readonly upload: (request: Request) => Promise<Response>;
  readonly download: (request: Request) => Promise<Response>;
}

/**
 * Binds the policy above to a bucket and a way to identify the caller.
 *
 * The bucket is a parameter, never a module global: production passes
 * `env.BUCKET` and `fault/r2-upload.fault.ts` passes that same binding wrapped
 * in CloudFault's `createR2FaultProxy`, so the fault lane exercises this exact
 * composition rather than a copy of it. One code path, no conditional.
 *
 * Both handlers are inert while `integrations.storage.enabled` is false (the
 * template's default): they answer 404 without touching the bucket. The
 * fault lane passes `{ enabled: true }` so it can exercise the enabled path
 * without mocking the config module — the flag is a parameter for the same
 * reason the bucket is.
 */
export const createStorageHandlers = (
  bucket: R2Bucket,
  authorize: Authorize,
  options: EnabledOption = {},
): StorageHandlers => {
  // SAFETY: the same R2 binding described twice. `R2Bucket` here is the
  // generated worker-configuration.d.ts one and `StorageBucket` is
  // `@cloudflare/workers-types`', both from the same workerd. They are not
  // mutually assignable only because `R2Object.writeHttpMetadata` takes each
  // universe's own `Headers`, and this app's `Headers` is the DOM lib's, so
  // there is no single assertion between them and nothing to parse.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions
  const storageBucket = bucket as unknown as StorageBucket;
  return {
    upload: createUploadHandler({
      bucket: storageBucket,
      enabled: options.enabled,
      authorize,
      limits: uploadLimits,
      prefix: STORAGE_PREFIX,
      key: uploadKey,
    }),
    download: createDownloadHandler({
      bucket: storageBucket,
      enabled: options.enabled,
      authorize,
      prefix: STORAGE_PREFIX,
      basePath: STORAGE_BASE_PATH,
    }),
  };
};
