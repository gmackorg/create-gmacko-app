import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
import type { Wire } from "../decode.js";
import type { Authorizer, AuthzRequest, PipValue } from "../gatekeeper.js";
export interface ExactQuantity {
    quantity?: string;
    unit?: string;
}
export interface IssueEntitlement extends ExactQuantity {
    holder: string;
    right: string;
    scope: string;
    validFrom: string;
    validUntil?: string;
    reason: string;
}
export interface RecordObligation extends ExactQuantity {
    obligatedParty: string;
    requirement: string;
    scope: string;
    incurredAt: string;
    dueAt?: string;
    reason: string;
}
export interface EffectiveRight {
    entitlement: string;
    holder: string;
    right: string;
    scope: string;
    quantity: string | null;
    unit: string | null;
}
export interface EffectiveRightsPage {
    items: EffectiveRight[];
    next: string | null;
}
/** Business rights and duties; never an authorization decision or consumption ledger. */
export declare class Entitlements {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    issue(input: IssueEntitlement, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    recordObligation(input: RecordObligation, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    revoke(entitlement: string, effectiveAt: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    expire(entitlement: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    /** An independently issued successor, not reactivation. Revoking a predecessor does
     * not cancel successors. The unique predecessor reference arbitrates concurrent renewal. */
    renew(entitlement: string, input: {
        validFrom: string;
        validUntil?: string;
        quantity?: string;
        reason: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    endObligation(obligation: string, kind: "Discharged" | "Cancelled", effectiveAt: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    obligationAt(obligation: string, at: string, ctx: CallContext): Effect.Effect<{
        obligation: Wire;
        state: "NotIncurred" | "Open" | "Overdue" | "Discharged" | "Cancelled";
    }, ForgeError>;
    listEffectiveRights(holder: string, scope: string, at: string, ctx: CallContext, page?: {
        cursor?: string;
        limit?: number;
    }): Effect.Effect<EffectiveRightsPage, ForgeError>;
}
/** Caller supplies authorized tenant-scoped Party representation and entitlement facts.
 * Independent policy decides; reevaluate every request so unchanged records cannot cache
 * an allow across revocation or validity boundaries. Never recursively read through this bridge. */
export declare function entitlementPipAuthorizer(base: Authorizer, read: (request: AuthzRequest) => Effect.Effect<PipValue[], ForgeError>): Authorizer;
