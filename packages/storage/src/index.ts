/**
 * `@gmacko/storage`: file uploads on Cloudflare R2.
 *
 * `storage.ts` holds the bucket operations; `handlers.ts` holds the two fetch
 * handlers that authorize and enforce limits. This module is the public
 * surface, so nothing outside the package imports either file directly.
 */

export {
  type Authorize,
  createDownloadHandler,
  createUploadHandler,
  type DownloadHandlerOptions,
  type UploadHandlerOptions,
  type UploadIdentity,
} from "./handlers";
export {
  chunksOf,
  contentTypeAllowed,
  createStorage,
  type EnabledOption,
  isStorageEnabled,
  type ListPage,
  MIN_PART_SIZE,
  readLimited,
  type Storage,
  type StorageBucket,
  type StorageOptions,
  StorageRejected,
  StorageTooLarge,
  type StoredObject,
  type UploadLimits,
} from "./storage";
