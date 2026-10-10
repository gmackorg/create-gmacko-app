import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
/** A Party profile over ConceptIR's typed Relationship carrier; this grants no authority. */
export declare class PartyRelationships {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private dependencies;
    record(input: {
        definition: string;
        fromParty: string;
        toParty: string;
        scope?: string;
        validFrom: string;
        validUntil?: string;
        source: string;
        support?: string;
    }, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    end(relationship: string, effectiveAt: string, reason: string, ctx: CallContext, replacement?: string): Effect.Effect<any, ForgeError, never>;
    current(id: string, at: string, ctx: CallContext): Effect.Effect<Wire | null, ForgeError>;
    /** Inverse perspectives return the same authoritative relationship ID. Exhaust every cursor. */
    listAt(party: string, perspective: 'forward' | 'inverse', at: string, ctx: CallContext, page?: {
        cursor?: string;
        limit?: number;
    }): Effect.Effect<{
        items: Wire[];
        next: string | null;
    }, ForgeError>;
}
