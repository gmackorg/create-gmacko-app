/**
 * Provider switching (plan §22). Recompiling for another target moves no
 * data; this module does: a canonical export of every authoritative record
 * (ids, revisions, soft-delete state, blob manifests) with a canonical hash
 * per resource, an import behind a write fence that preserves identities and
 * revisions and rebuilds unique claims and access items through the normal
 * commit path, and a verification report (counts, hashes, references,
 * revisions) both sides must agree on before traffic moves. Caches and
 * projections are rebuilt on the new provider, never copied; native workflow
 * history is not portable (drain or restart from a checkpoint).
 */
import { Effect } from "effect";
import type { Wire } from "./decode.js";
import { type CallContext, type Engine } from "./engine.js";
import { type ForgeError } from "./errors.js";
import { type RuntimeServices, type StoredRecord } from "./services.js";
export declare const EXPORT_VERSION = "export/1";
export interface ResourceExport {
    count: number;
    hash: string;
    records: StoredRecord[];
}
export interface Snapshot {
    version: typeof EXPORT_VERSION;
    package: string;
    tenant: string;
    exportedAt: string;
    manifest: {
        contractsVersion: string;
        buildHash: string;
        resources: string[];
    };
    resources: Record<string, ResourceExport>;
    /** What the export deliberately leaves behind, so nobody mistakes absence for emptiness. */
    excluded: {
        workflowInstances: number;
        note: string;
        rebuiltOnTarget: string[];
    };
}
export declare class Portability {
    private readonly engine;
    constructor(engine: Engine);
    private get authoritative();
    handle(action: string, body: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    /** Every writer checks the fence before committing (plan §22: stop or fence writes during a first migration). */
    isFenced(tenant: string): Effect.Effect<boolean, ForgeError, RuntimeServices>;
    private fence;
    private scanAll;
    export(ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    private checkSnapshot;
    /**
     * Records of a self-referencing resource (e.g. a thread's `root`) in dependency order, so each
     * record's in-snapshot targets are imported before it. A record referencing itself has no
     * prerequisite (#200); a cycle through other records keeps snapshot order and fails its guard.
     */
    private selfReferenceOrder;
    /** Records go through the adapter's own commit so claims, access items and integrity guards are rebuilt natively. */
    import(input: Snapshot | undefined, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    verify(input: Snapshot | undefined, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    /** Resources ordered so that referenced resources come first (cycles fall back to declaration order). */
    private ordered;
}
