import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export interface WorkforceState {
    events: Wire[];
    appointments: Wire[];
    endings: Map<string, string>;
}
export declare class Workforces {
    private readonly engine;
    constructor(engine: Engine);
    private eligible;
    state(position: string, ctx: CallContext): Effect.Effect<WorkforceState, ForgeError>;
    publish(incumbency: string, action: 'Appoint' | 'End', at: string, previous: string | null, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    at(position: string, at: string, ctx: CallContext): Effect.Effect<Wire | null, ForgeError>;
}
