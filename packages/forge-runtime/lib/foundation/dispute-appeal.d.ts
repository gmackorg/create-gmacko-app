import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export declare class Disputes {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private read;
    private support;
    private charge;
    private contested;
    private mandate;
    inspect(id: string, ctx: CallContext): Effect.Effect<{
        row: Wire;
        contested: Wire;
    }, ForgeError>;
    private inspectLevel;
    result(id: string, ctx: CallContext): Effect.Effect<{
        row: Wire;
        dispute: Wire;
    }, ForgeError>;
    private resultLevel;
    remedy(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        result: {
            row: Wire;
            dispute: Wire;
        };
    }, ForgeError, never>;
}
