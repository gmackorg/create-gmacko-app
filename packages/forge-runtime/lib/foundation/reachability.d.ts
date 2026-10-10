import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
import type { Wire } from "../decode.js";
/** Contact points reach people; endpoints reach systems. The two are never interchangeable. */
export type Profile = "ContactPoint" | "Endpoint";
export interface LocatorDeclaration {
    locatorSet: string;
    kind: string;
    purpose: string;
    value: string;
    preference: number;
    validFrom: string;
    validUntil?: string;
}
export interface LocatorSelector {
    locatorSet: string;
    kind: string;
    purpose: string;
}
export interface ResolvedLocator {
    locator: string;
    locatorSet: string;
    value: string;
    preference: number;
    verified: boolean;
}
/**
 * Reachability operations over the typed sidecar.
 *
 * Resolution is deliberately not a single indexed read. Preference orders candidates, but
 * whether a candidate is reachable *now* depends on its validity window and on whether a
 * terminal disposition has ended it — neither of which an index can answer. So the ordered
 * list is walked and the first surviving candidate wins, which is also why the page is
 * bounded: an unbounded scan here would be a scan of somebody's contact details.
 *
 * Nothing here decides whether a subject should be contacted. That is consent and
 * notification preference, and both live outside this package on purpose.
 */
export declare class Reachability {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    declare(profile: Profile, input: LocatorDeclaration, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    verify(profile: Profile, locator: string, evidence: {
        verifiedAt: string;
        method: string;
        evidence: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    revoke(profile: Profile, locator: string, effectiveAt: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    supersede(profile: Profile, locator: string, replacement: string, effectiveAt: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    /** The preferred locator reachable at `at`, or null when the set has none for that purpose. */
    resolve(profile: Profile, selector: LocatorSelector, at: string, ctx: CallContext, limit?: number): Effect.Effect<ResolvedLocator | null, ForgeError>;
    listBySet(profile: Profile, locatorSet: string, ctx: CallContext, page?: {
        cursor?: string;
        limit?: number;
    }): Effect.Effect<Wire, ForgeError, never>;
}
