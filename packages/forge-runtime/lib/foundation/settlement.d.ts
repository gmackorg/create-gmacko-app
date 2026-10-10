import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
export type SettlementAdmission = (source: Wire, allocations: readonly {
    position: Wire;
    quantity: string;
}[], ctx: CallContext, effectiveAt?: string, knownAt?: string) => Effect.Effect<void, ForgeError>;
export interface SettlementAllocation {
    position: string;
    quantity: string;
}
export interface SettlementCommand {
    book: string;
    key: string;
    occurredAt: string;
    effectiveAt: string;
    reason: string;
    lines: SettlementAllocation[];
    source: string;
}
/** Immutable event publication serializes a bounded book. No mutable balance cache
 * and no staged candidate contributes to authority. All quantities are decimal6. */
export declare class Settlements {
    private readonly engine;
    private readonly admission?;
    constructor(engine: Engine, admission?: SettlementAdmission | undefined);
    private call;
    private clean;
    private now;
    private instant;
    private scan;
    private position;
    openPosition(input: {
        book: string;
        obligation: string;
        creditor: string;
        agreement?: string;
        reason: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private admit;
    private lines;
    admitSource(input: {
        book: string;
        key: string;
        kind: "Materialize" | "Settle";
        unit: string;
        quantity: string;
        occurredAt: string;
        fulfillmentEnd: string;
        reason: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private source;
    private history;
    private balances;
    materialize(input: SettlementCommand, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    settle(input: SettlementCommand, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    reverse(book: string, original: string, input: {
        key: string;
        occurredAt: string;
        effectiveAt: string;
        reason: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private publish;
    inspect(positionId: string, query: {
        asOf: string;
        knownAt?: string;
        party?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    linkLedger(commitId: string, postingId: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
