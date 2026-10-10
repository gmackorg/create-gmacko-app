/**
 * Cloudflare R2 object store. Presigned URLs need S3 credentials for R2, so
 * uploads/downloads are served through the Worker itself by default: the
 * "signed URL" is a Worker route carrying an HMAC-signed, expiring token for
 * one key and method (a bearer capability, like a presigned URL). Direct S3
 * presigning can be enabled by supplying R2 S3 credentials.
 */
import { Effect } from "effect";
import { type ForgeError } from "../errors.js";
import type { ObjectHead, ObjectStoreAdapter, SignedUrl } from "../services.js";
export interface R2Like {
    head(key: string): Promise<{
        size: number;
        httpMetadata?: {
            contentType?: string;
        };
        etag: string;
    } | null>;
    get(key: string): Promise<{
        body: ReadableStream<Uint8Array>;
        size: number;
        httpMetadata?: {
            contentType?: string;
        };
        etag: string;
    } | null>;
    put(key: string, value: ReadableStream | ArrayBuffer | Uint8Array | string, options?: {
        httpMetadata?: {
            contentType?: string;
        };
    }): Promise<{
        etag: string;
    }>;
    delete(key: string): Promise<void>;
}
export interface SignedObjectToken {
    key: string;
    method: "PUT" | "GET";
    exp: number;
    mediaType: string;
    byteCount?: number;
}
export declare function signObjectToken(secret: string, t: SignedObjectToken): Promise<string>;
export declare function verifyObjectToken(secret: string, token: string): Promise<SignedObjectToken | null>;
export declare class R2ObjectStore implements ObjectStoreAdapter {
    private readonly bucket;
    private readonly opts;
    readonly name = "r2";
    constructor(bucket: R2Like, opts: {
        baseUrl: string;
        secret: string;
    });
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
    /** Serve `/_forge/objects/<token>`: the Worker-side equivalent of a presigned URL. */
    serve(request: Request, token: string): Promise<Response>;
}
