import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
import { type UsageInput } from './usage.js';
export declare class Operations {
    private readonly engine;
    constructor(engine: Engine);
    private chain;
    start(run: string, actual: string | null, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    usage(run: string, input: UsageInput, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    end(run: string, outcome: 'Completed' | 'Failed' | 'Cancelled', reason: string, ctx: CallContext, evaluation?: string): Effect.Effect<Wire, ForgeError>;
    cleanup(ended: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    state(run: string, ctx: CallContext): Effect.Effect<{
        phase: string;
        cleanupPending: boolean;
    }, ForgeError>;
}
