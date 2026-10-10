import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
import type { Wire } from "../decode.js";
export interface IdentifierAssignment {
    identifierSet: string;
    namespace: string;
    value: string;
    issuer?: string;
    validFrom: string;
    validUntil?: string;
}
export interface QualifiedIdentifier {
    namespace: string;
    value: string;
    issuer?: string;
}
export interface IdentifierLookup {
    identifier: string;
    identifierSet: string;
}
/** Typed sidecar operations. Applications map IdentifierSet back to a typed owner.
 * Namespace names fold to lowercase; this initial profile trims case-sensitive values. */
export declare class Identifiers {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    assign(input: IdentifierAssignment, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    revoke(identifier: string, effectiveAt: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    supersede(identifier: string, replacement: string, effectiveAt: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    lookup(qualified: QualifiedIdentifier, at: string, ctx: CallContext): Effect.Effect<IdentifierLookup | null, ForgeError>;
    listBySet(identifierSet: string, ctx: CallContext, page?: {
        cursor?: string;
        limit?: number;
    }): Effect.Effect<Wire, ForgeError, never>;
}
