import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
export declare class Subscriptions {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private read;
    private term;
    private history;
    private validate;
    act(input: {
        subscription: string;
        previous: string | null;
        term: string;
        kind: 'start' | 'renew' | 'change' | 'suspend' | 'resume' | 'cancel';
        effectiveAt: string;
        reason: string;
        support: string;
    }, ctx: CallContext): Effect.Effect<any, import("../errors.js").ForgeError, never>;
    state(id: string, instant: string, ctx: CallContext): Effect.Effect<{
        phase: string;
        effective: boolean;
        term: any;
        quota: {
            allowance: string;
            grant: string;
            scope: string;
            dimension: string;
            unit: string;
            from: string;
            until: string;
            through: string;
            limit: string;
            used: string;
            reserved: string;
            remaining: string;
            requested: string;
            projected: string;
            exceeded: boolean;
            decision: "Warn" | "Prohibit" | "WithinLimit";
            usageEventIds: string[];
            allocationHead: string | null;
            reservationIds: string[];
        } | null;
        serviceLevel: import("./service-level.js").ServiceState | null;
        row: any;
        events: Wire[];
        head: {} | null;
    }, import("../errors.js").ForgeError, never>;
    proration(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        charge: any;
        event: any;
    }, import("../errors.js").ForgeError, never>;
}
