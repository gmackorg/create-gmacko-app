/** AWS S3 object store: real presigned PUT/GET, HEAD for verification, CopyObject to seal. */
import { S3Client } from "@aws-sdk/client-s3";
import { Effect } from "effect";
import { type ForgeError } from "../errors.js";
import type { ObjectHead, ObjectStoreAdapter, SignedUrl } from "../services.js";
export declare class S3ObjectStore implements ObjectStoreAdapter {
    private readonly bucket;
    readonly name = "s3";
    private readonly s3;
    constructor(bucket: string, region: string, client?: S3Client);
    private wrap;
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
}
