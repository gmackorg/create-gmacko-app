import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export declare class Notifications {
    private readonly engine;
    constructor(engine: Engine);
    private recover;
    /** The explicitly selected immutable preference is the dispatch policy snapshot.
     * Later changes apply to future snapshots and do not cancel existing notices. */
    create(input: {
        key: string;
        subscription: string;
        preference: string;
        at: string;
        content?: string;
        template?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private subscription;
    /** A page of visible subscriptions; exhaust the cursor for a complete visible audience. */
    audience(topic: string, ctx: CallContext, page?: {
        cursor?: string;
        limit?: number;
    }): Effect.Effect<any, ForgeError, never>;
    dispatch(notification: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    outcome(notification: string, ctx: CallContext): Effect.Effect<{
        status: string;
        intent: string | null;
    }, ForgeError>;
}
