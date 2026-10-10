import type { CallContext } from "../engine.js";
import type { ArtifactRevisionPin, ArtifactObjectFormat } from "../versioned-artifacts.js";
export interface GitArtifactWorkspaceBinding {
    readonly directory: string;
    readonly tenant: string;
    readonly artifact: string;
    readonly generation: string;
    readonly repositoryId: string;
    readonly objectFormat: ArtifactObjectFormat;
}
export interface ArtifactFileChange {
    readonly path: string;
    readonly bytes: Uint8Array | null;
    readonly mode?: "100644" | "100755";
}
export interface ArtifactDifference {
    readonly path: string;
    readonly status: "added" | "deleted" | "modified";
    readonly before: string | null;
    readonly after: string | null;
    readonly beforeMode: string;
    readonly afterMode: string;
}
export interface ArtifactWorkspaceAuthorization {
    readonly action: "prepare" | "diff" | "merge" | "materialize";
    readonly tenant: string;
    readonly actor: string;
    readonly artifact: string;
    readonly generation: string;
    readonly purpose?: string;
}
export declare class GitArtifactWorkspace {
    private readonly authorize;
    private readonly binding;
    constructor(binding: GitArtifactWorkspaceBinding, authorize: (request: Readonly<ArtifactWorkspaceAuthorization>) => Promise<boolean>);
    private oid;
    private git;
    private checked;
    private admit;
    private pin;
    private metadata;
    private commit;
    prepare(input: {
        base: ArtifactRevisionPin | null;
        changes: readonly ArtifactFileChange[];
        message: string;
        at: string;
    }, context: CallContext): Promise<ArtifactRevisionPin>;
    diff(left: ArtifactRevisionPin, right: ArtifactRevisionPin, context: CallContext, options?: {
        maxEntries?: number;
    }): Promise<readonly ArtifactDifference[]>;
    /** Trusted host destination under an exclusively owned parent. Consumers must
     * not activate it until success; no hooks, checkout filters or Git config run. */
    materialize(revision: ArtifactRevisionPin, destination: string, context: CallContext, options?: {
        maxFiles?: number;
        maxBytes?: number;
        /** Opt-in preserves only relative links directly to files or directories in this tree. */
        symlinks?: "reject" | "internal";
    }): Promise<{
        files: number;
        bytes: number;
    }>;
    merge(input: {
        base: ArtifactRevisionPin;
        left: ArtifactRevisionPin;
        right: ArtifactRevisionPin;
        message: string;
        at: string;
    }, context: CallContext): Promise<{
        status: "prepared";
        revision: ArtifactRevisionPin;
    } | {
        status: "conflicted";
        paths: readonly string[];
    }>;
}
