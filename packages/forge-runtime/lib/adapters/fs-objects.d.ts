import type { R2Like } from "./r2.js";
export declare class FsBucket implements R2Like {
    private readonly root;
    constructor(root: string);
    private pathOf;
    private meta;
    head(key: string): Promise<{
        etag: string;
        httpMetadata?: {
            contentType: string;
        };
        size: number;
    } | null>;
    get(key: string): Promise<{
        etag: string;
        httpMetadata?: {
            contentType: string;
        };
        body: ReadableStream<Uint8Array>;
        size: number;
    } | null>;
    put(key: string, value: ReadableStream | ArrayBuffer | Uint8Array | string, options?: {
        httpMetadata?: {
            contentType?: string;
        };
    }): Promise<{
        etag: string;
    }>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
}
