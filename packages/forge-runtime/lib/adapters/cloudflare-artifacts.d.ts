/** Cloudflare Artifacts Workers read binding, open-beta surface checked 2026-10-01.
 * Kept structural so consumers need not upgrade their Workers global types. */
import type { ArtifactReadProvider } from '../versioned-artifacts.js';
export interface CloudflareArtifactRepo {
    info(): Promise<{
        id: string;
        name: string;
    }>;
    log(options: {
        ref: string;
        limit: number;
    }): Promise<readonly {
        hash: string;
    }[]>;
    readCommit(oid: string): Promise<{
        hash: string;
        treeHash: string;
        parents: string[];
    } | null>;
    readFile(options: {
        ref: string;
        path: string;
    }): Promise<Blob | null>;
    [Symbol.dispose](): void;
}
export interface CloudflareArtifactsBinding {
    get(name: string): Promise<CloudflareArtifactRepo>;
}
/** Bind only server-selected repository names. The reader verifies the stable repo
 * ID against its configured binding on every open, rejecting name reuse. */
export declare function cloudflareArtifactsReader(binding: CloudflareArtifactsBinding, name: string): ArtifactReadProvider;
