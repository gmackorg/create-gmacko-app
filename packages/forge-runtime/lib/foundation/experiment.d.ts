import { Effect } from 'effect';
import { type Engine, type CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export declare class Experiments {
    private readonly engine;
    constructor(engine: Engine);
    private find;
    state(experiment: string, ctx: CallContext): Effect.Effect<{
        experiment: Wire;
        variants: Wire[];
        events: Wire[];
        assignments: Wire[];
        closed: boolean;
    }, ForgeError>;
    assign(input: {
        experiment: string;
        subjectKey: string;
        provenance: string;
        variant?: string;
        participant?: string;
        reservation?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    close(experiment: string, cancelled: boolean, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
