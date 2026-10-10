import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
/** Evidence describes support for a conclusion, never its subject or verdict.
 * Normal engine authorization governs each bundle/item and referenced artifact. */
export declare class Evidence {
    private readonly engine;
    constructor(engine: Engine);
    record(input: {
        bundle: string;
        source: string;
        sourceRecord: string;
        kind: string;
        observedAt: string;
        provenance: string;
        revision?: string;
        digest?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    /** Candidate list only; sealedItems is the authoritative frozen support. */
    items(bundle: string, ctx: CallContext, page?: {
        cursor?: string;
        limit?: number;
    }): Effect.Effect<any, ForgeError, never>;
    member(bundle: string, item: string, next: string | null, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    seal(bundle: string, head: string | null, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    successor(predecessor: string, key: string, label: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    sealedItems(bundle: string, ctx: CallContext): Effect.Effect<Wire[], ForgeError>;
    private readChain;
    artifact(item: string, ctx: CallContext): Effect.Effect<Wire | null, ForgeError>;
}
