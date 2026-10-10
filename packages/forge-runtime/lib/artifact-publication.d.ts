/** Journaled single-ref publication. Unknown dispatch outcomes are never replayed. */
import type { CallContext } from "./engine.js";
import type { ArtifactCommit, ArtifactObjectFormat, ArtifactRevisionPin } from "./versioned-artifacts.js";
export interface ArtifactPublicationRepository {
    readonly repositoryId: string;
    readonly objectFormat: ArtifactObjectFormat;
    commit(oid: string): Promise<ArtifactCommit | null>;
    head(ref: string): Promise<string | null>;
    /** Must atomically compare the exact old OID (null = absent). Throw on ambiguity. */
    compareAndSwap(ref: string, expected: string | null, next: string): Promise<"accepted" | "rejected">;
    dispose(): void;
}
export interface ArtifactPublicationProvider {
    open(): Promise<ArtifactPublicationRepository>;
}
export interface ArtifactPublicationBinding {
    readonly tenant: string;
    readonly artifact: string;
    readonly generation: string;
    readonly repositoryId: string;
    readonly provider: ArtifactPublicationProvider;
}
export interface ArtifactPublicationRequest {
    readonly key: string;
    readonly ref: string;
    readonly expected: string | null;
    readonly revision: ArtifactRevisionPin;
}
export interface ArtifactPublicationIntent extends ArtifactPublicationRequest {
    readonly actor: string;
    readonly purpose: string | null;
}
export interface ArtifactPublicationReceipt {
    readonly intent: ArtifactPublicationIntent;
    /** observed means desired head was seen, not that this request caused it. */
    readonly outcome: "pending" | "accepted" | "rejected" | "observed";
}
export interface ArtifactPublicationJournal {
    /** Durable atomic insert-if-absent; exactly one contender owns dispatch. */
    claim(intent: ArtifactPublicationIntent): Promise<{
        owned: boolean;
        receipt: ArtifactPublicationReceipt;
    }>;
    get(intent: ArtifactPublicationIntent): Promise<ArtifactPublicationReceipt | null>;
    /** Conditional pending -> terminal; must never overwrite a terminal receipt. */
    finish(intent: ArtifactPublicationIntent, outcome: Exclude<ArtifactPublicationReceipt["outcome"], "pending">): Promise<ArtifactPublicationReceipt>;
}
export interface ArtifactPublicationAuthorization {
    readonly action: "publish" | "recover";
    readonly tenant: string;
    readonly artifact: string;
    readonly generation: string;
    readonly actor: string;
    readonly purpose?: string;
    readonly ref: string;
    readonly expected: string | null;
    readonly revision: Readonly<ArtifactRevisionPin>;
}
export declare function validArtifactBranch(ref: unknown): ref is string;
/** Canonical intent encoding also scopes replay to actor and authorization purpose. */
export declare function artifactPublicationIntentKey(i: ArtifactPublicationIntent): string;
export declare class ArtifactPublisher {
    private readonly journal;
    private readonly authorize;
    private readonly bindings;
    constructor(bindings: readonly ArtifactPublicationBinding[], journal: ArtifactPublicationJournal, authorize: (request: Readonly<ArtifactPublicationAuthorization>) => Promise<boolean>);
    publish(request: ArtifactPublicationRequest, context: CallContext): Promise<ArtifactPublicationReceipt>;
    /** Read-only provider reconciliation. Never retries a dispatch or claims a new key. */
    recover(request: ArtifactPublicationRequest, context: CallContext): Promise<ArtifactPublicationReceipt>;
    private run;
}
