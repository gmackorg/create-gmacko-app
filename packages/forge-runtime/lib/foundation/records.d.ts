import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
/** Durable decisions only. Physical archival/destruction is a separate, authorized adapter. */
export declare class Records {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private evidence;
    register(rule: string, triggeredAt: string, ctx: CallContext, support?: string | null): Effect.Effect<any, ForgeError, never>;
    private event;
    state(record: string, ctx: CallContext): Effect.Effect<{
        record: any;
        rule: any;
        events: Wire[];
        holds: Map<string, Wire>;
        disposed: boolean;
    }, ForgeError, never>;
    private append;
    hold(record: string, at: string, reason: string, authority: string, ctx: CallContext, support?: string | null): Effect.Effect<any, ForgeError, never>;
    release(record: string, hold: string, at: string, reason: string, authority: string, ctx: CallContext, support?: string | null): Effect.Effect<any, ForgeError, never>;
    dispose(record: string, at: string, reason: string, authority: string, ctx: CallContext, support?: string | null): Effect.Effect<any, ForgeError, never>;
}
