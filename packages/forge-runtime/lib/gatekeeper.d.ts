/**
 * Gatekeeper boundary (plan §9–10, FORGE-048..051). Forge computes the
 * canonical request (principal, action, purpose, resource scope, current and
 * candidate state, PIP values with freshness, epochs) and an `Authorizer`
 * returns a typed decision: allow / deny with plan constraints, obligations
 * from a known set, expiry and the policy epoch. Unknown obligations and
 * missing or stale attributes deny. `localAuthorizer` is the built-in typed
 * evaluator (a verified subset: equality/membership on record fields with
 * values from constants or PIP attributes); a remote Gatekeeper or OPA
 * adapter implements the same interface. Decisions are cached per (epoch,
 * principal, action, purpose, record revision) with a bounded TTL, so a
 * revocation that bumps the epoch invalidates every cached allow at once.
 */
import { Effect } from "effect";
import type { Wire } from "./decode.js";
import type { CallContext, Engine } from "./engine.js";
import { type ForgeError } from "./errors.js";
import type { Resource } from "./model.js";
export interface PipValue {
    pip: string;
    attribute: string;
    value: unknown;
    observedAt: string;
    expiresAt: string;
}
export interface AuthzRequest {
    principal: {
        tenant: string;
        actor: string;
        issuer?: string;
        workload?: string;
    };
    action: string;
    kind: string;
    resource?: string;
    purpose?: string;
    /** Current stored state (reads, mutations) and the candidate state a mutation would commit. */
    current?: Wire;
    candidate?: Wire;
    attributes: PipValue[];
    requestId: string;
}
export interface Obligation {
    kind: string;
    detail?: string;
}
export interface RowFilter {
    field: string;
    op: "eq" | "in" | "ne";
    values: unknown[];
}
export interface Decision {
    effect: "allow" | "deny";
    decisionId: string;
    policy?: string;
    /** Typed row predicate the decision depends on (for list pushdown / residual checks). */
    rowFilter?: RowFilter[];
    obligations: Obligation[];
    epoch: number;
    expiresAt: string;
    reason?: string;
}
export interface Authorizer {
    /** Attributes must be resolved per row rather than from a static PIP snapshot. */
    readonly liveAttributes?: boolean;
    readonly epoch: number;
    readonly knownObligations: string[];
    /** Attribute providers the authorizer's policies draw from (the runtime gathers values with freshness). */
    readonly pips?: PipProvider[];
    /** Attributes a policy needs for an action; the runtime gathers them from PIPs before deciding. */
    requirements(action: string, purpose?: string): {
        pip: string;
        attribute: string;
    }[];
    /** Row predicate for list pushdown, when the policy is exactly expressible; `null` means per-record checks. */
    rowFilterFor(action: string, purpose: string | undefined, attributes: PipValue[]): {
        policy: string;
        filter: RowFilter[];
    } | "unsupported" | null;
    decide(req: AuthzRequest): Effect.Effect<Decision, ForgeError>;
}
export interface PipProvider {
    name: string;
    /** actor -> attributes (a static PIP; production PIPs fetch and cache) */
    attributes: Record<string, Record<string, unknown>>;
    freshnessMs: number;
}
export interface PolicyCondition {
    field: string;
    op: "eq" | "in" | "ne";
    values?: unknown[];
    /** Values derived from a PIP attribute through an explicit map (attribute value -> permitted values). */
    from?: {
        pip: string;
        attribute: string;
        map: Record<string, unknown[]>;
    };
}
export interface Policy {
    id: string;
    /** Action id patterns (`@pkg/_/Resource.*`). */
    actions: string[];
    purpose?: string;
    requires: {
        pip: string;
        attribute: string;
    }[];
    where: PolicyCondition[];
    obligations?: Obligation[];
}
export declare function localAuthorizer(o: {
    policies: Policy[];
    pips: PipProvider[];
    epoch: number;
    knownObligations: string[];
    ttlMs?: number;
}): Authorizer;
export declare class Gatekeeper {
    private readonly engine;
    authorizer: Authorizer | null;
    private cache;
    private hits;
    private misses;
    constructor(engine: Engine);
    cacheStats(): {
        hits: number;
        misses: number;
        size: number;
    };
    private pipProviders;
    pips: PipProvider[];
    /** Gather the attributes a policy requires; each value carries observedAt/expiresAt. */
    attributes(action: string, purpose: string | undefined, actor: string): PipValue[];
    /** Decide for one record (current and optional candidate). Cached per epoch/principal/action/purpose/record revision. */
    /** Last decision taken (operator diagnostics; never part of a caller-visible error). */
    lastDecision: Decision | null;
    decide(action: string, kind: string, r: Resource | null, ctx: CallContext, current?: Wire, candidate?: Wire): Effect.Effect<Decision, ForgeError>;
    /** Read gate: a denied record reads as not found (no existence disclosure, plan §9.1). */
    requireRead(action: string, r: Resource, ctx: CallContext, current: Wire): Effect.Effect<void, ForgeError>;
    requireWrite(action: string, r: Resource, ctx: CallContext, current: Wire | null, candidate: Wire): Effect.Effect<void, ForgeError>;
    /** Operation-level gate when no record is involved (creates without current state still pass the candidate). */
    requireOperation(action: string, r: Resource | null, ctx: CallContext): Effect.Effect<Decision, ForgeError>;
    /** List plan: `exact` when the policy predicate is on fields the query can express, else bounded candidate filtering. */
    listPlan(action: string, r: Resource, ctx: CallContext, params: Wire): {
        kind: "exact" | "candidate" | "unsupported" | "none";
        policy?: string;
        filter: RowFilter[];
        reason?: string;
    };
}
