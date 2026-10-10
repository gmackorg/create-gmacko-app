import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export interface CompositionView {
    instance: Wire;
    revision: Wire | null;
    members: Wire[];
    children: CompositionView[];
    cycle: boolean;
}
export declare class Compositions {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private complete;
    private spec;
    specification(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        slots: Wire[];
        allowed: Map<string, Set<string>>;
    }, ForgeError, never>;
    private history;
    private inspect;
    conform(instance: string, at: string, ctx: CallContext): Effect.Effect<CompositionView, ForgeError, never>;
    publish(input: {
        instance: string;
        set: string;
        previous: string | null;
        from: string;
        until?: string;
        reason: string;
    }, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
}
