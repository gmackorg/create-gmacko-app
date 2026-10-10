import { Effect } from "effect";
import type { Wire } from "../decode.js";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
export interface RepresentationFact {
    representation: string;
    principal: string;
    party: string;
}
export interface RepresentationPage {
    items: RepresentationFact[];
    next: string | null;
}
/** Durable business identity only. These facts never authenticate or authorize a caller. */
export declare class Parties {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    create(input: {
        label: string;
        identifiers?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    represent(input: {
        party: string;
        principal: string;
        validFrom: string;
        validUntil?: string;
        reason: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    revoke(representation: string, effectiveAt: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    listRepresentedAt(principal: string, at: string, ctx: CallContext, page?: {
        cursor?: string;
        limit?: number;
    }): Effect.Effect<RepresentationPage, ForgeError>;
}
