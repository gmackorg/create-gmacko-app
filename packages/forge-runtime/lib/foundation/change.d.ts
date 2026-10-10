import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export declare class Changes {
    private readonly engine;
    constructor(engine: Engine);
    private decision;
    implement(change: string, fulfillment: string, scheduledAt: string, ctx: CallContext, decision?: string): Effect.Effect<Wire, ForgeError>;
    end(input: {
        change: string;
        outcome: 'Completed' | 'Failed' | 'Cancelled' | 'Rejected';
        reason: string;
        implementation?: string;
        fulfillment?: string;
        fulfillmentEnd?: string;
        verification?: string;
        decision?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    state(change: string, ctx: CallContext): Effect.Effect<{
        change: Wire;
        phase: string;
        implementation: Wire | null;
        ended: Wire | null;
        rollback: Wire | null;
        supersession: Wire | null;
    }, ForgeError>;
}
