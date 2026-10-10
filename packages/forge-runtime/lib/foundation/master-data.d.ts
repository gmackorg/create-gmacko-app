import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
/** Source-scoped immutable mapping journal. Only validated state() is authoritative. */
export declare class MasterData {
    private readonly engine;
    constructor(engine: Engine);
    private validateSurvivorship;
    state(source: string, ctx: CallContext): Effect.Effect<{
        history: Wire[];
        current: Wire | null;
    }, ForgeError>;
    initialize(source: string, canonical: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    merge(source: string, survivorship: string, previous: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    unmerge(source: string, previous: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
