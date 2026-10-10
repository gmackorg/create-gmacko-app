import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
import type { Wire } from "../decode.js";
export interface ConsentSelector {
    subject: string;
    purpose: string;
    activity: string;
    scope: string;
}
export interface GrantInput extends ConsentSelector {
    grantedTo?: string;
    basis?: string;
    conditions?: string;
    validFrom: string;
    validUntil?: string;
    recordedAt: string;
}
export interface ConsentState {
    grant: string;
    validFrom: string;
    recordedAt: string;
    evidenced: boolean;
}
/** Both axes of a question about the past. */
export interface AsOf {
    /** When the permission had to apply. */
    validAt: string;
    /** What this instance knew at the time. Defaults to `validAt` for a present-tense question. */
    knownAt?: string;
}
/**
 * Consent facts and the bitemporal question they exist to answer.
 *
 * `effectiveAt` is the only interesting operation here. A decision made last Tuesday has to be
 * explainable with what was known last Tuesday: a withdrawal recorded on Friday, backdated to
 * Monday, must not make Tuesday's decision retroactively wrong, and must still stop Saturday's.
 * So a grant counts only when it was both in force at `validAt` and already recorded by
 * `knownAt`, and a disposition suppresses it under exactly the same two tests.
 *
 * This is a bounded interpretation built from ordinary fields, not an L0 temporal facet.
 * ConceptIR #75 is what would make valid and knowledge time a language-level axis; until then
 * the convention lives in this package and the query that reads it lives here.
 *
 * Nothing here authorizes anything. A policy engine may read this as one input; a null result
 * means no permission was recorded, which is not the same as a denial.
 */
export declare class Consent {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    grant(input: GrantInput, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    evidence(grant: string, captured: {
        capturedAt: string;
        method: string;
        provenance: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    withdraw(grant: string, when: {
        effectiveAt: string;
        recordedAt: string;
    }, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    supersede(grant: string, replacement: string, when: {
        effectiveAt: string;
        recordedAt: string;
    }, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    /** The grant in force at `validAt` as known at `knownAt`, or null when there was none. */
    effectiveAt(selector: ConsentSelector, asOf: AsOf, ctx: CallContext, limit?: number): Effect.Effect<ConsentState | null, ForgeError>;
    listBySubject(subject: string, ctx: CallContext, page?: {
        cursor?: string;
        limit?: number;
    }): Effect.Effect<Wire, ForgeError, never>;
}
