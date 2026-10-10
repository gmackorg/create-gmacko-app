/** Read-only versioned artifact contract. Journaled publication is a separate
 * capability in artifact-publication.ts; this reader never mutates repositories. */
import type { CallContext } from './engine.js';
export type ArtifactObjectFormat = 'sha1' | 'sha256';
export interface ArtifactCommit {
    readonly oid: string;
    readonly tree: string;
    readonly parents: readonly string[];
}
export interface ArtifactRepository {
    readonly repositoryId: string;
    readonly objectFormat: ArtifactObjectFormat;
    resolve(selector: string): Promise<string | null>;
    commit(oid: string): Promise<ArtifactCommit | null>;
    file(oid: string, path: string): Promise<Blob | null>;
    dispose(): void;
}
/** A trusted composition-root capability, never constructed from caller URLs. */
export interface ArtifactReadProvider {
    open(): Promise<ArtifactRepository>;
}
export interface ArtifactReadBinding {
    readonly tenant: string;
    readonly artifact: string;
    readonly generation: string;
    readonly repositoryId: string;
    readonly provider: ArtifactReadProvider;
}
export interface ArtifactRevisionPin {
    readonly tenant: string;
    readonly artifact: string;
    readonly generation: string;
    readonly repositoryId: string;
    readonly objectFormat: ArtifactObjectFormat;
    readonly oid: string;
    readonly tree: string;
}
export interface ArtifactReadAuthorization {
    readonly action: 'resolve' | 'readFile' | 'history';
    readonly tenant: string;
    readonly actor: string;
    readonly artifact: string;
    readonly generation: string;
    readonly purpose?: string;
}
export type AuthorizeArtifactRead = (request: Readonly<ArtifactReadAuthorization>) => Promise<boolean>;
export declare class VersionedArtifactReader {
    private readonly authorize;
    readonly capabilities: Readonly<{
        resolve: true;
        readFile: true;
        history: true;
        publish: false;
        merge: false;
        fork: false;
    }>;
    private readonly bindings;
    constructor(bindings: readonly ArtifactReadBinding[], authorize: AuthorizeArtifactRead);
    private binding;
    private withRepository;
    private pinnedCommit;
    resolve(artifact: string, selector: string, context: CallContext): Promise<Readonly<ArtifactRevisionPin>>;
    readFile(revision: ArtifactRevisionPin, path: string, context: CallContext, options?: {
        maxBytes?: number;
    }): Promise<{
        bytes: Uint8Array;
        mediaType: string;
    }>;
    /** Deterministic depth-first traversal in parent order; never a truncated success.
     * Missing/shallow ancestry, cycles and exhausted budgets fail explicitly. */
    history(revision: ArtifactRevisionPin, context: CallContext, options?: {
        maxCommits?: number;
    }): Promise<readonly Readonly<ArtifactCommit>[]>;
}
