import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
export interface LedgerEntry {
    account: string;
    quantity: string;
}
export interface LedgerPost {
    book: string;
    key: string;
    entries: LedgerEntry[];
    policy: "balanced" | "unrestricted";
    reason: string;
    reversalOf?: string;
}
/** A bounded book (512 groups, 128 entries/group), published one immutable seal
 * at a time. Every consumer revalidates raw seals; malformed publication fails closed. */
export declare class Ledger {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private entries;
    private groups;
    post(input: LedgerPost, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    reverse(book: string, original: string, key: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    /** Authorized published group plus reversal provenance for composed systems. */
    inspect(group: string, ctx: CallContext): Effect.Effect<{
        reversedBy: Wire | null;
        fact: Wire;
        entries: LedgerEntry[];
    }, ForgeError, never>;
    rebuild(book: string, ctx: CallContext): Effect.Effect<{
        groupIds: string[];
        balances: {
            [k: string]: string;
        };
    }, ForgeError, never>;
    balance(account: string, ctx: CallContext): Effect.Effect<{
        account: string;
        unit: string;
        quantity: string;
        groupIds: string[];
    }, ForgeError, never>;
}
