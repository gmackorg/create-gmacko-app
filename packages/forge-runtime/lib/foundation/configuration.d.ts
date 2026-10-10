import { Effect } from "effect";
import { type Engine, type CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
import type { Wire } from "../decode.js";
export interface ResolvedEntry {
    key: string;
    /** Null for a secret parameter, whose value this package never holds. */
    value: string | null;
    /** The binding a secret parameter points at, never the secret itself. */
    secretRef: string | null;
    /** Which configuration in the chain supplied it, or null when it came from the default. */
    source: string | null;
}
export interface Resolution {
    resolved: string;
    digest: string;
    entries: ResolvedEntry[];
}
/**
 * Configuration resolution.
 *
 * Determinism comes from layer ordinals, not from traversal order: the chain is walked to the
 * root and the highest-ordinal assignment for each parameter wins, which is the same answer
 * whichever end you start from. `Configuration`'s own rules guarantee the chain is strictly
 * increasing, so there is never a tie to break.
 *
 * Every resolved value carries the configuration it came from. Without that, a surprising
 * value is unattributable and the only way to explain it is to re-derive the whole chain by
 * hand. The digest is computed over the resolved entries in key order, including its pin and effective sources, so the same snapshot
 * produces the same identity on any machine and a reconciler can compare identities
 * rather than values.
 *
 * Secrets are never resolved here. A secret parameter resolves to the binding it references;
 * dereferencing that is the caller's business, and this package is deliberately incapable of it.
 */
export declare class Configuration {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private validateLiteral;
    /** The configuration chain, root first. */
    private chain;
    /**
     * Resolve and record. `resolvedAt` is supplied rather than read from a clock so a resolution
     * is reproducible: re-resolving the same chain at the same instant is the same fact, and the
     * digest proves it.
     */
    resolve(configuration: string, resolvedAt: string, ctx: CallContext, limit?: number): Effect.Effect<Resolution, ForgeError>;
    listValues(resolved: string, ctx: CallContext, page?: {
        cursor?: string;
        limit?: number;
    }): Effect.Effect<Wire, ForgeError, never>;
}
