import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export type BudgetAction = 'Commit' | 'Release' | 'Spend' | 'Reverse';
type Claim = {
    row: Wire;
    phase: BudgetAction;
    actual: Wire | null;
};
export interface BudgetState {
    envelope: Wire;
    events: Wire[];
    claims: Map<string, Claim>;
    committed: string;
    spent: string;
    available: string;
}
export declare class Budgets {
    private readonly engine;
    constructor(engine: Engine);
    private validateActual;
    private apply;
    state(envelope: string, ctx: CallContext): Effect.Effect<BudgetState, ForgeError>;
    publish(input: {
        encumbrance: string;
        action: BudgetAction;
        previous: string | null;
        actual?: string;
        reversal?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
export {};
