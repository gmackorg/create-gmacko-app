import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export declare class Integrations {
    private readonly engine;
    constructor(engine: Engine);
    private support;
    webhook(connection: string, providerEvent: string, digest: string, support: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    accepted(seal: string, ctx: CallContext): Effect.Effect<Wire[], ForgeError>;
    checkpoint(run: string, seal: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    cursor(connection: string, ctx: CallContext): Effect.Effect<Wire | null, ForgeError>;
}
