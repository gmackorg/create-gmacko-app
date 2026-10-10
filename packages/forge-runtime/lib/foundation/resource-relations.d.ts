import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export interface RelationVocabulary<K extends string> {
    namespace: string;
    kinds: readonly K[];
}
export interface EstablishRelation<K extends string> {
    key: string;
    subject: string;
    party: string;
    kind: K;
    scope: string;
    quantity?: string;
    unit?: string;
    validFrom: string;
    validUntil?: string;
    source: string;
    reason: string;
}
export interface RelationView {
    relation: string;
    party: string;
    kind: string;
    subject: string;
    scope: string;
    quantity: string | null;
    unit: string | null;
    validFrom: string;
    validUntil: string | null;
    knownFrom: string;
    establishment: string;
    termination: string | null;
}
/** Package-owned bitemporal interpretation, not ConceptIR #75/#77 implementation.
 * A candidate never grants a relation; one commit owns admission and predecessor end.
 * No relation implies authorization, legal title, or globally exclusive custody. */
export declare class ResourceRelations<K extends string> {
    private readonly engine;
    private readonly namespace;
    private readonly kinds;
    constructor(engine: Engine, vocabulary: RelationVocabulary<K>);
    private call;
    private instant;
    private keyContext;
    registerKind(kind: K, definition: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    private validateCommit;
    private validateSource;
    private validateCandidate;
    establish(input: EstablishRelation<K>, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private publish;
    /** Transition identity is the event key. Unique prior and current claims commit together. */
    handoff(input: {
        key: string;
        prior: string;
        party: string;
        effectiveAt: string;
        source: string;
        reason: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    end(input: {
        key: string;
        relation: string;
        effectiveAt: string;
        source: string;
        reason: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    asOf(subject: string, time: {
        validAt: string;
        knownAt: string;
    }, ctx: CallContext): Effect.Effect<RelationView[], ForgeError>;
}
