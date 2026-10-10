/** In-memory object store with the same seal/staging semantics as R2/S3 (the semantic reference). */
import { Effect } from "effect";
import { type ForgeError } from "../errors.js";
import type { ObjectHead, ObjectStoreAdapter, SignedUrl } from "../services.js";
export declare class MemoryObjectStore implements ObjectStoreAdapter {
    readonly name = "memory-objects";
    private objects;
    private gen;
    presignUpload(key: string, mediaType: string, byteCount: number, ttlSeconds: number): Effect.Effect<SignedUrl, ForgeError>;
    head(key: string): Effect.Effect<ObjectHead | null, ForgeError>;
    digest(key: string, maxBytes: number): Effect.Effect<{
        sha256: string;
        byteCount: number;
    }, ForgeError>;
    seal(stagingKey: string, sealedKey: string, mediaType: string): Effect.Effect<{
        generation: string | null;
    }, ForgeError>;
    presignDownload(key: string, ttlSeconds: number, mediaType: string): Effect.Effect<SignedUrl, ForgeError>;
    delete(key: string): Effect.Effect<void, ForgeError>;
    /** Test helpers standing in for a client's direct PUT / GET against the signed URL. */
    simulateUpload(url: string, bytes: Uint8Array, mediaType: string): Promise<void>;
    simulateDownload(url: string): Promise<Uint8Array>;
}
